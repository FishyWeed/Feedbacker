/** Window event: the owner session is gone, so the admin shows the sign-in page. */
export const SIGNED_OUT = 'feedbacker:signed-out';

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string>) {
    super(message);
  }
}

/** Uploads an image or video file. Returns its URL on this server (for example `/uploads/abc.png`) and its type. */
export async function uploadFile(file: File): Promise<{ url: string; type: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event(SIGNED_OUT));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Upload failed (${res.status}).`);
  return data;
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/me' && path !== '/login') window.dispatchEvent(new Event(SIGNED_OUT));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`, data.errors);
  return data as T;
}
