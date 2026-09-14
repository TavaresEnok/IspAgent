import * as path from 'node:path';
import { config } from 'dotenv';

// Testes rodam no host (fora do Docker): ISPAGENT_DATABASE_URL em .env já aponta para localhost e a
// porta publicada pelo compose (ver .env.example), não para o hostname interno dos containers.
config({ path: path.resolve(__dirname, '../../../.env') });
