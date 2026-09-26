import { testDatabaseUrl } from './test-db';

// Testes rodam no host (fora do Docker) e SEMPRE contra o banco `*_test` (ver test-db.ts) — nunca contra
// o banco de trabalho, que tem dados reais de um provedor.
process.env.ISPAGENT_DATABASE_URL = testDatabaseUrl();
process.env.ISPAGENT_ENV = 'test';
process.env.ISPAGENT_ENCRYPTION_KEY ??= 'test-only-encryption-key-0123456789abcdef';
process.env.ISPAGENT_JWT_SECRET ??= 'test-only-jwt-secret-0123456789abcdef0123';
process.env.ISPAGENT_JWT_REFRESH_SECRET ??= 'test-only-refresh-secret-0123456789abcdef01';
