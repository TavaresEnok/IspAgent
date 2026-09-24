import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/**
 * Criptografia em repouso (AES-256-GCM) para credenciais de terceiros guardadas no banco (chaves de IA,
 * senha do PulseISP). Formato: `enc:v1:` + base64(iv[12] | tag[16] | ciphertext). Valor sem o prefixo é
 * tratado como legado em texto puro (lido normalmente e regravado cifrado no próximo acesso).
 */
const PREFIX = 'enc:v1:';

let cachedKey: { source: string; key: Buffer } | null = null;

function deriveKey(): Buffer {
  const explicit = process.env.ISPAGENT_ENCRYPTION_KEY;
  const production = process.env.ISPAGENT_ENV === 'production';

  if (!explicit && production) {
    throw new Error('[secret-cipher] ISPAGENT_ENCRYPTION_KEY é obrigatória em produção.');
  }
  // Fora de produção, sem chave dedicada, deriva do segredo JWT (comodidade de desenvolvimento).
  const source = explicit ?? process.env.ISPAGENT_JWT_SECRET;
  if (!source) throw new Error('[secret-cipher] defina ISPAGENT_ENCRYPTION_KEY (ou ISPAGENT_JWT_SECRET em dev).');

  if (cachedKey?.source === source) return cachedKey.key;
  const key = explicit
    ? createHash('sha256').update(explicit).digest()
    : scryptSync(source, 'ispagent-dev-encryption', 32);
  cachedKey = { source, key };
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** Lança se o valor cifrado não puder ser aberto (chave errada/dado adulterado). */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** Como `decryptSecret`, mas devolve `null` (em vez de lançar) quando não dá para abrir. */
export function tryDecryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}
