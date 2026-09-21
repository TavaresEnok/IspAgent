const path = require('node:path');
const { execSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { resolveTestDatabaseUrl } = require('./test-db');

/**
 * Cria (se preciso) o banco `*_test`, aplica as migrations e roda o seed determinístico nele — assim
 * `pnpm test` é autossuficiente e nunca toca o banco de desenvolvimento.
 */
module.exports = async () => {
  const { url, dbName, adminUrl } = resolveTestDatabaseUrl();
  process.env.ISPAGENT_DATABASE_URL = url;

  if (process.env.ISPAGENT_TEST_SKIP_SETUP === '1') return;

  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    const found = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (found.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
      console.log(`[test-setup] banco ${dbName} criado`);
    }
  } finally {
    await admin.$disconnect();
  }

  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, ISPAGENT_DATABASE_URL: url };
  execSync('pnpm exec prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('pnpm exec ts-node -r tsconfig-paths/register prisma/seed.ts', { cwd, env, stdio: 'pipe' });
};
