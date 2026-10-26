import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  IMAGE_CHUNK_BYTES,
  ImageUploadService,
  splitImageChunks,
} from './image-upload.service';
import { API_ORIGIN, resolveMediaUrl } from '../utils/media-url';

describe('resolveMediaUrl', () => {
  it('resuelve rutas relativas del backend', () => {
    expect(resolveMediaUrl('/media/avatars/abc?v=1')).toBe(`${API_ORIGIN}/media/avatars/abc?v=1`);
  });

  it('respeta URLs absolutas y datos ya resueltos', () => {
    expect(resolveMediaUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(resolveMediaUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('devuelve null para valores vacíos', () => {
    expect(resolveMediaUrl(null)).toBeNull();
    expect(resolveMediaUrl('  ')).toBeNull();
  });
});

describe('splitImageChunks', () => {
  it('parte una imagen en trozos por debajo del límite del backend', () => {
    const blob = new Blob([new Uint8Array(IMAGE_CHUNK_BYTES * 2 + 1024)]);
    const chunks = splitImageChunks(blob);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].size).toBe(IMAGE_CHUNK_BYTES);
    expect(chunks[1].size).toBe(IMAGE_CHUNK_BYTES);
    expect(chunks[2].size).toBe(1024);
    expect(IMAGE_CHUNK_BYTES).toBeLessThanOrEqual(512 * 1024);
  });

  it('mantiene un único trozo para imágenes pequeñas', () => {
    const blob = new Blob([new Uint8Array(1024)]);
    expect(splitImageChunks(blob)).toHaveLength(1);
  });
});

describe('ImageUploadService', () => {
  let service: ImageUploadService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ImageUploadService);
  });

  it('rechaza archivos que no son fotos', async () => {
    const file = new File(['%PDF-1.4'], 'documento.pdf', { type: 'application/pdf' });

    await expect(firstValueFrom(service.uploadAvatar(file))).rejects.toThrow(
      'Selecciona una foto',
    );
  });

  it('rechaza archivos de más de 20 MB antes de decodificarlos', async () => {
    const file = new File([new Uint8Array(21 * 1024 * 1024)], 'grande.jpg', {
      type: 'image/jpeg',
    });

    await expect(firstValueFrom(service.uploadAvatar(file))).rejects.toThrow('muy grande');
  });
});
