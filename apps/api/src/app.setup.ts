import { LogLevel, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json } from 'express';
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

  // Corpo JSON: 100 KB (padrão) em tudo, exceto as rotas que recebem arquivo em base64 (comprovante e
  // áudio do Web Chat). Registrado antes do parser global do Nest, que então ignora o corpo já lido.
  // O nome da função importa: o Nest só registra o parser JSON global se não achar um middleware chamado
  // `jsonParser` — que é o nome da função devolvida por `json()`. Sem o wrapper, nenhuma rota lia o corpo.
  const mediaJson = json({ limit: '9mb' });
  app.use(
    ['/public/webchat/:tenantId/upload-receipt', '/public/webchat/:tenantId/voice'],
    function mediaJsonParser(req: Parameters<typeof mediaJson>[0], res: Parameters<typeof mediaJson>[1], next: Parameters<typeof mediaJson>[2]) {
      mediaJson(req, res, next);
    },
  );
  // Evolution (WhatsApp por QR Code) manda áudio/imagem embutidos em base64 no próprio evento.
  const evolutionJson = json({ limit: '12mb' });
  app.use('/public/evolution/webhook/:instance/:secret', function mediaJsonParserEvolution(req: Parameters<typeof evolutionJson>[0], res: Parameters<typeof evolutionJson>[1], next: Parameters<typeof evolutionJson>[2]) {
    evolutionJson(req, res, next);
  });
  // Logo da marca (data URL até ~300 KB) e fluxos grandes (até 200 blocos) passam do padrão de 100 KB.
  const settingsJson = json({ limit: '1mb' });
  app.use(['/tenant/branding', '/flows/:id', '/flows/simulate'], function mediaJsonParserSettings(req: Parameters<typeof settingsJson>[0], res: Parameters<typeof settingsJson>[1], next: Parameters<typeof settingsJson>[2]) {
    settingsJson(req, res, next);
  });

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
