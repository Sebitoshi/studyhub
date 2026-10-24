/**
 * Compresión de imágenes en el navegador antes de enviarlas al backend.
 *
 * Hay dos límites que respeta:
 *  - El de la plataforma (~4.5 MB por petición).
 *  - El del borde de Vercel: un `multipart/form-data` con binario de alta
 *    entropía por encima de ~1 MB se rechaza con 503 sin llegar al backend.
 *
 * Por eso la imagen se reduce a un lado máximo de 1600 px y se baja la calidad
 * de WebP hasta quedar por debajo de 900 KB. Si aun así pesa demasiado (fotos
 * muy ruidosas), se reintenta con 1280 y 1024 px.
 */

const TARGET_BYTES = 900 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_SIDES = [1600, 1280, 1024];
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];

/** Devuelve un mensaje de error legible o `null` si la imagen es válida. */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Selecciona una imagen (JPG, PNG o WebP).';
  }
  if (!file.size) {
    return 'La imagen está vacía.';
  }
  if (file.size > MAX_INPUT_BYTES) {
    return 'La imagen supera los 25 MB. Prueba con una más ligera.';
  }
  return null;
}

/** Tamaño legible (KB/MB) para mostrar en la interfaz. */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function compressImageForUpload(file: File): Promise<File> {
  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  let objectUrl: string | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        // Respeta la orientación EXIF de las fotos de móvil.
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = null;
      }
    }

    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      bitmap = img;
    }

    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');

    let blob: Blob | null = null;

    for (const maxSide of MAX_SIDES) {
      const scale = Math.min(1, maxSide / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      // Fondo blanco: evita que las transparencias queden negras al pasar a WebP.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        blob = await toBlob(canvas, 'image/webp', quality);
        if (blob && blob.size <= TARGET_BYTES) break;
      }

      if (blob && blob.size <= TARGET_BYTES) break;
    }

    if (!blob) {
      blob = await toBlob(canvas, 'image/jpeg', 0.8);
    }
    if (!blob) throw new Error('No se pudo comprimir');

    const name = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    return new File([blob], `${name}.webp`, { type: blob.type || 'image/webp' });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (bitmap && 'close' in bitmap) (bitmap as ImageBitmap).close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}
