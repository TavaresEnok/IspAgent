const path = require('node:path');
const { config } = require('dotenv');

config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Testes NUNCA rodam contra o banco de desenvolvimento/produção: a URL é derivada da
 * `ISPAGENT_DATABASE_URL` trocando o nome do banco por `<nome>_test` (ou vem de
 * `ISPAGENT_TEST_DATABASE_URL`). Se o nome final não terminar em `_test`, aborta.
 */
function resolveTestDatabaseUrl() {
  const explicit = process.env.ISPAGENT_TEST_DATABASE_URL;
  const base = explicit || process.env.ISPAGENT_DATABASE_URL;
  if (!base) throw new Error('[test-db] ISPAGENT_DATABASE_URL (ou ISPAGENT_TEST_DATABASE_URL) não definida.');

  const url = new URL(base);
  let dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!explicit && !dbName.endsWith('_test')) dbName = `${dbName}_test`;
  url.pathname = `/${dbName}`;

  if (!dbName.endsWith('_test')) {
    throw new Error(`[test-db] recusando rodar testes no banco "${dbName}": o nome precisa terminar em "_test".`);
  }
  return { url: url.toString(), dbName, adminUrl: withDatabase(url, 'postgres') };
}

function withDatabase(url, name) {
  const copy = new URL(url.toString());
  copy.pathname = `/${name}`;
  return copy.toString();
}

module.exports = { resolveTestDatabaseUrl };
