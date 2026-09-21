const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001');

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('ispagent_access_token');
}

export function setSession(accessToken: string, refreshToken: string) {
  window.localStorage.setItem('ispagent_access_token', accessToken);
  window.localStorage.setItem('ispagent_refresh_token', refreshToken);
}

export function clearSession() {
  window.localStorage.removeItem('ispagent_access_token');
  window.localStorage.removeItem('ispagent_refresh_token');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Cliente HTTP fino para o painel de staff — sempre manda o JWT quando existe, nunca inventa dado no front. */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? `Erro ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Falha no login');
  }
  return res.json() as Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; tenantId: string; role: string; email: string };
  }>;
}

export { API_URL };
