import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { testDatabaseUrl } from './test-db';

export default function globalSetup() {
  const env = { ...process.env, ISPAGENT_DATABASE_URL: testDatabaseUrl() };
  const cwd = path.resolve(__dirname, '..');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx ts-node -r tsconfig-paths/register prisma/seed.ts', { cwd, env, stdio: 'pipe' });
}
