import { testDatabaseUrl } from './test-db';

// Testes rodam no host (fora do Docker), contra o banco de teste na porta publicada pelo compose.
process.env.ISPAGENT_DATABASE_URL = testDatabaseUrl();
