import * as path from 'node:path';
import * as dns from 'node:dns';
import { config } from 'dotenv';

dns.setDefaultResultOrder('ipv4first');

/**
 * Testes NUNCA rodam contra o banco de trabalho/produção: a URL é derivada de `ISPAGENT_DATABASE_URL`
 * trocando o nome do banco por `<nome>_test` (ou vem de `ISPAGENT_TEST_DATABASE_URL`). Se o nome final
 * não terminar em `_test`, aborta — nem uma URL explícita errada consegue apontar para dado real.
 */
export function resolveTestDatabaseUrl(): { url: string; dbName: string; adminUrl: string } {
  config({ path: path.resolve(__dirname, '../../../.env') });
  const explicit = process.env.ISPAGENT_TEST_DATABASE_URL;
  const base = explicit || process.env.ISPAGENT_DATABASE_URL;
  if (!base) throw new Error('[test-db] ISPAGENT_DATABASE_URL (ou ISPAGENT_TEST_DATABASE_URL) não definida.');

  const url = new URL(base);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  let dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!explicit && !dbName.endsWith('_test')) dbName = `${dbName}_test`;
  url.pathname = `/${dbName}`;

  if (!dbName.endsWith('_test')) {
    throw new Error(`[test-db] recusando rodar testes no banco "${dbName}": o nome precisa terminar em "_test".`);
  }
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  return { url: url.toString(), dbName, adminUrl: admin.toString() };
}

export function testDatabaseUrl(): string {
  return resolveTestDatabaseUrl().url;
}
