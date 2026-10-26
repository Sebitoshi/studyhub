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
 *
 * Acepta cualquier foto que el navegador pueda decodificar (JPG, PNG, WebP,
 * GIF, BMP, AVIF, SVG…) y convierte HEIC/HEIF con `heic2any` cuando el
 * navegador no lo soporta de forma nativa (Chrome, Firefox, Edge).
 */

const TARGET_BYTES = 900 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_SIDES = [1600, 1280, 1024];
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];

const HEIC_MIMES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIC_EXTENSIONS = /\.(heic|heif)$/i;

/** Extensiones de foto aceptadas aunque el sistema no reporte un MIME. */
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|svg)$/i;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** ¿Es una foto HEIC/HEIF? (iPhone y algunas cámaras Android). */
export function isHeicImage(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  return HEIC_MIMES.includes(type) || HEIC_EXTENSIONS.test(file.name);
}

/** Devuelve un mensaje de error legible o `null` si la imagen es válida. */
export function validateImageFile(file: File): string | null {
  const type = (file.type || '').toLowerCase();
  const looksLikePhoto = type.startsWith('image/') || PHOTO_EXTENSIONS.test(file.name);
  if (!looksLikePhoto) {
    return 'Selecciona una foto (JPG, PNG, WebP, HEIC, GIF, BMP, AVIF…).';
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

interface DecodedImage {
  bitmap: ImageBitmap | HTMLImageElement;
  objectUrl: string | null;
}

/** Intenta decodificar con la API nativa y, si falla, con `<img>`. */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Respeta la orientación EXIF de las fotos de móvil.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { bitmap, objectUrl: null };
    } catch {
      // Se intenta el fallback con <img> (Safari decodifica HEIC así).
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    return { bitmap: img, objectUrl };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/** Convierte HEIC/HEIF a JPEG en navegadores que no lo soportan nativamente. */
async function convertHeicToJpeg(file: File): Promise<Blob> {
  const mod = await import('heic2any');
  const heic2any = mod.default;
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error('No se pudo convertir HEIC');
  return blob;
}

export async function compressImageForUpload(file: File): Promise<File> {
  let decoded: DecodedImage | null = null;

  try {
    try {
      decoded = await decodeImage(file);
    } catch (err) {
      if (!isHeicImage(file)) throw err;
      // HEIC en Chrome/Firefox/Edge: se convierte a JPEG y se reintenta.
      decoded = await decodeImage(await convertHeicToJpeg(file));
    }

    const bitmap = decoded.bitmap;
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
    const extension = EXTENSION_BY_TYPE[blob.type] || 'webp';
    return new File([blob], `${name}.${extension}`, { type: blob.type || 'image/webp' });
  } finally {
    if (decoded?.objectUrl) URL.revokeObjectURL(decoded.objectUrl);
    if (decoded && 'close' in decoded.bitmap) (decoded.bitmap as ImageBitmap).close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}
