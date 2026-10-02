/**
 * Saca un mensaje legible de un error HTTP.
 *
 * El backend responde `{ message }` o `{ error }`, pero cuando falla la
 * infraestructura (404 de Vercel, timeout, HTML de error) el cuerpo es texto
 * plano poco amable ("Cannot POST /ai/..."). En esos casos se usa el `fallback`.
 */
export function apiErrorMessage(error: any, fallback: string): string {
  const body = error?.error;

  if (body && typeof body === 'object') {
    const message = body.message ?? body.error;
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (Array.isArray(message) && message.length) return String(message[0]);
  }

  if (typeof body === 'string' && body.trim() && !looksLikeRawHttp(body)) return body.trim().slice(0, 200);

  // Servidor caído o sin conexión: el error de red no trae `error`.
  if (error?.status === 0) return 'No pudimos conectar con el servidor. Revisa tu conexión.';

  return fallback;
}

function looksLikeRawHttp(text: string): boolean {
  return /^\s*(cannot\s|<|<!doctype|\{?"?status"?\s*:)/i.test(text);
}
