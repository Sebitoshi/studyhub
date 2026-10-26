import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { API_ORIGIN, resolveMediaUrl } from '../utils/media-url';
import { decodeImageFile, validateImageFile } from '../utils/image-compress';

export interface AvatarUploadProgress {
  phase: 'optimizing' | 'uploading' | 'saving';
  percent: number;
}

export interface AvatarUploadResult {
  foto: string;
  bytes: number;
  mime: string;
  width: number;
  height: number;
  chunks: number;
  deduped: boolean;
}

interface ChunkProgress {
  uploadId: string;
  received: number;
  total: number;
  complete: boolean;
}

/** Trozo de 480 KB: por debajo del límite de 4,5 MB de Vercel y del tope de 512 KB del backend. */
export const IMAGE_CHUNK_BYTES = 480 * 1024;

/** Lado final del avatar. 320 px se ve nítido en retina y pesa pocos KB. */
const AVATAR_SIZE = 320;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

/**
 * Optimiza la foto en el navegador (recorte cuadrado, 320 px, WebP) y la sube en
 * trozos. Así el servidor recibe decenas de KB en vez de una foto de varios MB, no
 * se necesita `sharp` en Vercel y se respeta el límite de cuerpo de la plataforma.
 * El canvas también elimina los metadatos EXIF (incluida la geolocalización).
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private readonly http = inject(HttpClient);

  avatarUrl(value?: string | null): string | null {
    return resolveMediaUrl(value);
  }

  uploadAvatar(
    file: File,
    onProgress: (progress: AvatarUploadProgress) => void = () => undefined,
  ): Observable<AvatarUploadResult> {
    return new Observable<AvatarUploadResult>((observer) => {
      let cancelled = false;
      let uploadId: string | null = null;

      const cleanup = () => {
        if (uploadId) {
          this.http.delete(`${API_ORIGIN}/media/images/${uploadId}`).subscribe({
            error: () => undefined,
          });
        }
      };

      (async () => {
        try {
          this.assertSource(file);
          onProgress({ phase: 'optimizing', percent: 4 });
          let blob: Blob;
          try {
            blob = await optimizeAvatar(file);
          } catch {
            throw new Error(
              'No pudimos leer esta foto. Prueba con JPG, PNG, WebP, HEIC, GIF o BMP.',
            );
          }
          if (cancelled) return;

          const chunks = splitImageChunks(blob);
          const total = chunks.length;

          for (let index = 0; index < total; index++) {
            if (cancelled) return;
            const chunk = chunks[index];
            const form = new FormData();
            form.append('file', chunk, `avatar-${index}.part`);

            const params: Record<string, string | number> = { index, total, kind: 'avatar' };
            if (uploadId) params['uploadId'] = uploadId;

            const progress = await firstValueFrom(
              this.http.post<ChunkProgress>(`${API_ORIGIN}/media/images/chunk`, form, { params }),
            );
            uploadId = progress.uploadId;
            onProgress({
              phase: 'uploading',
              percent: 8 + Math.round(((index + 1) / total) * 84),
            });
          }

          if (cancelled || !uploadId) return;
          onProgress({ phase: 'saving', percent: 95 });
          const result = await firstValueFrom(
            this.http.post<AvatarUploadResult>(
              `${API_ORIGIN}/media/images/${uploadId}/complete`,
              {},
            ),
          );
          uploadId = null; // ya se procesó: no hay nada que cancelar

          if (!cancelled) {
            onProgress({ phase: 'saving', percent: 100 });
            observer.next(result);
            observer.complete();
          }
        } catch (error) {
          if (!cancelled) {
            cleanup();
            observer.error(error);
          }
        }
      })();

      return () => {
        cancelled = true;
        cleanup();
      };
    });
  }

  removeAvatar(): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API_ORIGIN}/media/avatar`);
  }

  /** Valida antes de decodificar para no gastar memoria con archivos enormes. */
  private assertSource(file: File): void {
    if (!file) throw new Error('No seleccionaste ninguna imagen.');
    const validation = validateImageFile(file);
    if (validation) throw new Error(validation);
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error('La imagen es muy grande (máximo 20 MB).');
    }
  }
}

/** Parte la imagen ya optimizada en trozos pequeños (exportado para pruebas). */
export function splitImageChunks(blob: Blob, chunkBytes = IMAGE_CHUNK_BYTES): Blob[] {
  const total = Math.max(1, Math.ceil(blob.size / chunkBytes));
  return Array.from({ length: total }, (_, index) =>
    blob.slice(index * chunkBytes, (index + 1) * chunkBytes),
  );
}

/** Recorta al centro, redimensiona y comprime a WebP (o JPEG como respaldo). */
async function optimizeAvatar(file: File): Promise<Blob> {
  const { bitmap, release } = await decodeImageFile(file);

  try {
    const scale = Math.max(AVATAR_SIZE / bitmap.width, AVATAR_SIZE / bitmap.height);
    const sourceWidth = AVATAR_SIZE / scale;
    const sourceHeight = AVATAR_SIZE / scale;
    const offsetX = (bitmap.width - sourceWidth) / 2;
    const offsetY = (bitmap.height - sourceHeight) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Tu navegador no pudo procesar la imagen.');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      offsetX,
      offsetY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );

    let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    if (!blob) blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
    if (!blob) throw new Error('Tu navegador no pudo comprimir la imagen.');

    // Si el navegador no soporta WebP y el JPEG sale pesado, bajamos calidad.
    if (blob.size > 700 * 1024) {
      blob = (await canvasToBlob(canvas, 'image/jpeg', 0.7)) || blob;
    }

    return blob;
  } finally {
    release();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
