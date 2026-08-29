import { getAccessToken } from './supabase';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...options, headers });
}

export async function describeError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.error === 'string') return data.error;
  } catch {
  }
  return `Request failed (${res.status}).`;
}
