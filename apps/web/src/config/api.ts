/** API root: same-origin `/api` in Docker, or full HTTPS URL when the UI is on GitHub Pages. */
const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
export const API_BASE = configured || '/api';
export const API_CROSS_ORIGIN = API_BASE.startsWith('http');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: API_CROSS_ORIGIN ? 'include' : init?.credentials,
  });
}

/** Vite `base` without a trailing slash, for React Router and print windows. */
export const APP_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;
