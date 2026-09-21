const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001');

const ACCESS_KEY = 'ispagent_access_token';
const REFRESH_KEY = 'ispagent_refresh_token';

/**
 * Os tokens ficam em localStorage (o painel é uma SPA que fala com a API por Bearer token). Isso os expõe
 * a qualquer XSS — por isso o access token é curto (15 min), o refresh token é rotacionado a cada uso
 * (reuso derruba a sessão) e a API/painel enviam cabeçalhos de segurança. Migrar para cookie httpOnly
 * exigiria CSRF explícito (ver docs/security.md).
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setSession(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession() {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Renova o par de tokens. Várias requisições que expiram juntas compartilham UMA renovação. */
function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);

  refreshInFlight ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = (await res.json()) as { accessToken: string; refreshToken: string };
      setSession(body.accessToken, body.refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function redirectToLogin() {
  clearSession();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

async function errorFrom(res: Response, fallback?: string): Promise<ApiError> {
  const body = await res.json().catch(() => ({ message: res.statusText }));
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  return new ApiError(res.status, message ?? fallback ?? `Erro ${res.status}`, body.code);
}

/**
 * Cliente HTTP fino para o painel de staff — manda o JWT quando existe. Se o access token expirou (401),
 * renova uma vez com o refresh token e repete a requisição; se a renovação falhar, volta ao login em vez
 * de deixar a tela quebrada em silêncio.
 */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const doFetch = () => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { ...opts, headers });
  };

  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'Sessão expirada. Entre novamente.');
  }

  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiLogin(email: string, password: string, tenantId?: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(tenantId ? { tenantId } : {}) }),
  });
  if (!res.ok) throw await errorFrom(res, 'Falha no login');
  return res.json() as Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; tenantId: string; role: string; email: string };
  }>;
}

/** Revoga o refresh token no servidor (best-effort) e limpa a sessão local. */
export async function apiLogout() {
  const refreshToken = getRefreshToken();
  clearSession();
  if (!refreshToken) return;
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

export { API_URL };
