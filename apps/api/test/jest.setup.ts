// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveTestDatabaseUrl } = require('./test-db');

// Testes rodam no host (fora do Docker) e SEMPRE contra o banco `*_test` (ver test-db.js) — nunca
// contra o banco de desenvolvimento, que pode conter dados reais de um tenant.
process.env.ISPAGENT_DATABASE_URL = resolveTestDatabaseUrl().url;
process.env.ISPAGENT_ENV = 'test';
process.env.ISPAGENT_ENCRYPTION_KEY ??= 'test-only-encryption-key-0123456789abcdef';
process.env.ISPAGENT_JWT_SECRET ??= 'test-only-jwt-secret-0123456789abcdef0123';
process.env.ISPAGENT_JWT_REFRESH_SECRET ??= 'test-only-refresh-secret-0123456789abcdef01';
