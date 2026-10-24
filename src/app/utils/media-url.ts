/** Origen del backend, igual que en los servicios existentes. */
export const API_ORIGIN = 'https://study-hub-backend-sigma.vercel.app';

/**
 * Las fotos nuevas se guardan en MongoDB y el backend devuelve una ruta relativa
 * (`/media/avatars/...`). Las fotos antiguas pueden ser URLs absolutas: ambas se
 * resuelven aquí sin romper nada.
 */
export function resolveMediaUrl(value?: string | null): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  return `${API_ORIGIN}${raw.startsWith('/') ? '' : '/'}${raw}`;
}
