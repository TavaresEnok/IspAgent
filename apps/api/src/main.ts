import 'reflect-metadata';
import * as dns from 'node:dns';

// Força IPv4 primeiro no Node.js para evitar atrasos e timeouts de DNS no Windows (SGP, Gemini, etc.)
dns.setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.ISPAGENT_API_PORT_INTERNAL ?? process.env.ISPAGENT_API_PORT ?? 3001;
  await app.listen(port as number);
  // eslint-disable-next-line no-console
  console.log(`[ispagent-api] listening on :${port}`);
}

bootstrap();
