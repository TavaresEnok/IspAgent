/**
 * Configuração de segurança lida de variáveis de ambiente. `ISPAGENT_ENV=production` liga o modo
 * estrito (segredos fortes obrigatórios, CORS explícito, rotas DEMO desligadas); qualquer outro valor
 * (development/test/demo) é permissivo, mas avisa em log quando um segredo ainda é o de exemplo.
 */

const DEFAULT_SECRET_MARKERS = ['change_me', 'changeme', 'ispagent_dev_password', 'test-only'];
const MIN_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

export function isProduction(env: Env = process.env): boolean {
  return env.ISPAGENT_ENV === 'production';
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

/** Web Chat público (`/public/webchat/*`). Fora de produção liga sozinho; em produção só se pedido. */
export function webchatPublicEnabled(env: Env = process.env): boolean {
  return flag(env.ISPAGENT_WEBCHAT_PUBLIC_ENABLED, !isProduction(env));
}

/** Rotas de conveniência DEMO (ex.: "Resetar conversa" sem login). Nunca ligam sozinhas em produção. */
export function demoEndpointsEnabled(env: Env = process.env): boolean {
  return flag(env.ISPAGENT_DEMO_ENDPOINTS, !isProduction(env));
}

/** No Web Chat o telefone digitado não prova nada; só um canal verificado (WhatsApp) prova. */
export function trustWebchatPhone(env: Env = process.env): boolean {
  return !isProduction(env);
}

export function corsOrigins(env: Env = process.env): string[] {
  return (env.ISPAGENT_CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function looksLikeDefault(secret: string | undefined): boolean {
  if (!secret) return true;
  const lower = secret.toLowerCase();
  return DEFAULT_SECRET_MARKERS.some((m) => lower.includes(m));
}

function weakSecret(name: string, value: string | undefined): string | null {
  if (!value) return `${name} não definida.`;
  if (looksLikeDefault(value)) return `${name} ainda tem um valor de exemplo/padrão.`;
  if (value.length < MIN_SECRET_LENGTH) return `${name} tem menos de ${MIN_SECRET_LENGTH} caracteres.`;
  return null;
}

export interface SecurityReport {
  errors: string[];
  warnings: string[];
}

export function checkSecurityConfig(env: Env = process.env): SecurityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bucket = isProduction(env) ? errors : warnings;

  for (const name of ['ISPAGENT_JWT_SECRET', 'ISPAGENT_JWT_REFRESH_SECRET', 'ISPAGENT_ENCRYPTION_KEY']) {
    const problem = weakSecret(name, env[name]);
    if (problem && !(name === 'ISPAGENT_ENCRYPTION_KEY' && !isProduction(env) && !env[name])) bucket.push(problem);
  }
  if (
    env.ISPAGENT_JWT_SECRET &&
    env.ISPAGENT_JWT_SECRET === env.ISPAGENT_JWT_REFRESH_SECRET
  ) {
    bucket.push('ISPAGENT_JWT_SECRET e ISPAGENT_JWT_REFRESH_SECRET não podem ser iguais.');
  }
  if ((env.ISPAGENT_DATABASE_URL ?? '').includes('ispagent_dev_password')) {
    bucket.push('ISPAGENT_DATABASE_URL usa a senha de exemplo do banco.');
  }

  if (isProduction(env)) {
    if (corsOrigins(env).length === 0) {
      errors.push('ISPAGENT_CORS_ORIGINS precisa listar as origens do painel em produção.');
    }
    if (flag(env.ISPAGENT_DEMO_ENDPOINTS, false)) {
      errors.push('ISPAGENT_DEMO_ENDPOINTS=true não é permitido em produção.');
    }
  }

  return { errors, warnings };
}

/** Chamado no boot: em produção lança com TODOS os problemas; fora dela devolve só avisos. */
export function assertSecureConfig(env: Env = process.env): string[] {
  const { errors, warnings } = checkSecurityConfig(env);
  if (errors.length > 0) {
    throw new Error(
      `[security-config] configuração insegura para produção:\n - ${errors.join('\n - ')}\n` +
        'Gere segredos com: openssl rand -base64 48',
    );
  }
  return warnings;
}
