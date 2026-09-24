import 'reflect-metadata';
import * as dns from 'node:dns';

// Força IPv4 primeiro no Node.js para evitar atrasos e timeouts de DNS no Windows (SGP, Gemini, etc.)
dns.setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, logLevels } from './app.setup';
import { assertSecureConfig } from './common/security-config';

async function bootstrap() {
  const logger = new Logger('bootstrap');
  // Em produção recusa subir se houver segredo padrão/fraco ou CORS sem allowlist; fora dela só avisa.
  try {
    for (const warning of assertSecureConfig()) logger.warn(`[security-config] ${warning}`);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels(),
    // Corpo bruto preservado para validar a assinatura do webhook do WhatsApp (X-Hub-Signature-256).
    rawBody: true,
  });
  configureApp(app);

  const port = process.env.ISPAGENT_API_PORT_INTERNAL ?? process.env.ISPAGENT_API_PORT ?? 3001;
  await app.listen(port as number);
  logger.log(`[ispagent-api] listening on :${port}`);
}

bootstrap();
