import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from './test-db';

/**
 * Cria (se preciso) o banco `*_test`, aplica as migrations e roda o seed determinístico nele — assim
 * `pnpm test` é autossuficiente e nunca toca o banco de trabalho.
 */
export default async function globalSetup() {
  const { url, dbName, adminUrl } = resolveTestDatabaseUrl();
  process.env.ISPAGENT_DATABASE_URL = url;
  if (process.env.ISPAGENT_TEST_SKIP_SETUP === '1') return;

  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    const found = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  } finally {
    await admin.$disconnect();
  }

  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, ISPAGENT_DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx ts-node -r tsconfig-paths/register prisma/seed.ts', { cwd, env, stdio: 'pipe' });
}
