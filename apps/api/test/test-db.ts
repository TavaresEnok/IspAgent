import * as path from 'node:path';
import { config } from 'dotenv';

import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

// Testes nunca usam o banco de trabalho (hoje só com a Vibe, sem o seed DEMO): usam `<banco>_test`,
// migrado e semeado pelo global-setup. ISPAGENT_TEST_DATABASE_URL sobrescreve, se precisar.
export function testDatabaseUrl(): string {
  config({ path: path.resolve(__dirname, '../../../.env') });
  if (process.env.ISPAGENT_TEST_DATABASE_URL) return process.env.ISPAGENT_TEST_DATABASE_URL;
  const base = process.env.ISPAGENT_DATABASE_URL;
  if (!base) throw new Error('ISPAGENT_DATABASE_URL não definido no .env');
  const url = new URL(base);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  const dbName = url.pathname.replace(/^\//, '');
  url.pathname = `/${dbName.endsWith('_test') ? dbName : `${dbName}_test`}`;
  return url.toString();
}
