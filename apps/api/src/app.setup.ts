import { LogLevel, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { corsOrigins, isProduction } from './common/security-config';

const LOG_LEVELS: Record<string, LogLevel[]> = {
  debug: ['log', 'error', 'warn', 'debug', 'verbose'],
  info: ['log', 'error', 'warn'],
  warn: ['error', 'warn'],
  error: ['error'],
};

export function logLevels(env: Record<string, string | undefined> = process.env): LogLevel[] {
  return LOG_LEVELS[(env.ISPAGENT_LOG_LEVEL ?? 'info').toLowerCase()] ?? LOG_LEVELS.info;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Origem permitida no CORS: só as listadas em `ISPAGENT_CORS_ORIGINS`. Fora de produção, `localhost` em
 * qualquer porta também passa (painel em dev). Requisições sem `Origin` (curl, server-to-server) não são
 * afetadas — CORS só protege navegadores.
 */
export function isOriginAllowed(origin: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!origin) return true;
  if (corsOrigins(env).includes(origin)) return true;
  return !isProduction(env) && LOCAL_ORIGIN.test(origin);
}

/** Configuração HTTP compartilhada entre `main.ts` e os testes de integração. */
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');

  // Atrás de proxy/load balancer, sem isto o rate limit enxerga o IP do proxy (todos os clientes juntos).
  const trustProxy = process.env.ISPAGENT_TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true');

  app.use(helmet());
  app.enableCors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Webchat-Token'],
    exposedHeaders: ['X-Webchat-Token'],
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
}
