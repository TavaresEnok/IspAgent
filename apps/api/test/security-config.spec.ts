import {
  assertSecureConfig,
  checkSecurityConfig,
  demoEndpointsEnabled,
  trustWebchatPhone,
  webchatPublicEnabled,
} from '../src/common/security-config';
import { decryptSecret, encryptSecret, isEncrypted, tryDecryptSecret } from '../src/common/secret-cipher';
import { UnsafeOutboundUrlError, assertSafeOutboundUrl } from '../src/common/outbound-url';
import { maskDocument } from '../src/common/mask-document';
import { isOriginAllowed, logLevels } from '../src/app.setup';

const STRONG = 'Zx9!kQ2mP7vL4nR8tB6wY1cE3hJ5uA0dF'; // 33+ chars, sem marcador de exemplo

const productionEnv = {
  ISPAGENT_ENV: 'production',
  ISPAGENT_JWT_SECRET: STRONG,
  ISPAGENT_JWT_REFRESH_SECRET: STRONG.split('').reverse().join(''),
  ISPAGENT_ENCRYPTION_KEY: STRONG + 'enc',
  ISPAGENT_CORS_ORIGINS: 'https://painel.exemplo.com.br',
  ISPAGENT_DATABASE_URL: 'postgresql://app:senhaforte@db:5432/ispagent',
};

describe('configuração de segurança (boot)', () => {
  it('produção com tudo forte passa sem erros', () => {
    expect(checkSecurityConfig(productionEnv).errors).toEqual([]);
    expect(() => assertSecureConfig(productionEnv)).not.toThrow();
  });

  it.each([
    ['segredo JWT de exemplo', { ISPAGENT_JWT_SECRET: 'change_me_dev_only_jwt_secret' }],
    ['segredo JWT curto', { ISPAGENT_JWT_SECRET: 'curto' }],
    ['refresh igual ao access', { ISPAGENT_JWT_REFRESH_SECRET: productionEnv.ISPAGENT_JWT_SECRET }],
    ['sem chave de criptografia', { ISPAGENT_ENCRYPTION_KEY: undefined }],
    ['senha de banco de exemplo', { ISPAGENT_DATABASE_URL: 'postgresql://x:ispagent_dev_password@db/ispagent' }],
    ['CORS sem allowlist', { ISPAGENT_CORS_ORIGINS: '' }],
    ['rotas DEMO ligadas', { ISPAGENT_DEMO_ENDPOINTS: 'true' }],
  ])('produção RECUSA subir com %s', (_label, override) => {
    expect(() => assertSecureConfig({ ...productionEnv, ...override })).toThrow(/configuração insegura/);
  });

  it('fora de produção só avisa (não impede o desenvolvimento local)', () => {
    const env = { ISPAGENT_ENV: 'development', ISPAGENT_JWT_SECRET: 'change_me_dev_only_jwt_secret' };
    const warnings = assertSecureConfig(env);
    expect(warnings.some((w) => w.includes('ISPAGENT_JWT_SECRET'))).toBe(true);
  });

  it('Web Chat público, rotas DEMO e confiança no telefone: ligados no DEMO, desligados por padrão em produção', () => {
    expect([webchatPublicEnabled({}), demoEndpointsEnabled({}), trustWebchatPhone({})]).toEqual([true, true, true]);
    const prod = { ISPAGENT_ENV: 'production' };
    expect([webchatPublicEnabled(prod), demoEndpointsEnabled(prod), trustWebchatPhone(prod)]).toEqual([false, false, false]);
    expect(webchatPublicEnabled({ ...prod, ISPAGENT_WEBCHAT_PUBLIC_ENABLED: 'true' })).toBe(true);
  });
});

describe('CORS e log', () => {
  it('só origens da allowlist passam; em dev localhost também; sem Origin (curl) não é afetado', () => {
    const prod = { ISPAGENT_ENV: 'production', ISPAGENT_CORS_ORIGINS: 'https://painel.exemplo.com.br' };
    expect(isOriginAllowed('https://painel.exemplo.com.br', prod)).toBe(true);
    expect(isOriginAllowed('https://evil.example', prod)).toBe(false);
    expect(isOriginAllowed('http://localhost:3010', prod)).toBe(false);
    expect(isOriginAllowed('http://localhost:3010', { ISPAGENT_ENV: 'development' })).toBe(true);
    expect(isOriginAllowed('https://evil.example', { ISPAGENT_ENV: 'development' })).toBe(false);
    expect(isOriginAllowed(undefined, prod)).toBe(true);
  });

  it('ISPAGENT_LOG_LEVEL agora tem efeito', () => {
    expect(logLevels({ ISPAGENT_LOG_LEVEL: 'error' })).toEqual(['error']);
    expect(logLevels({ ISPAGENT_LOG_LEVEL: 'debug' })).toContain('debug');
    expect(logLevels({})).toEqual(['log', 'error', 'warn']);
  });
});

describe('criptografia de credenciais em repouso', () => {
  it('cifra e decifra; o valor gravado não contém o segredo e cada cifra é diferente (IV aleatório)', () => {
    const a = encryptSecret('sk-ant-super-secreta');
    const b = encryptSecret('sk-ant-super-secreta');
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain('super-secreta');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('sk-ant-super-secreta');
  });

  it('valor legado em texto puro é aceito (migração preguiçosa)', () => {
    expect(decryptSecret('chave-antiga-em-texto-puro')).toBe('chave-antiga-em-texto-puro');
  });

  it('dado adulterado ou chave trocada não abre: tryDecrypt devolve null, nunca lixo', () => {
    const stored = encryptSecret('segredo');
    expect(tryDecryptSecret(stored.slice(0, -4) + 'AAAA')).toBeNull();

    const original = process.env.ISPAGENT_ENCRYPTION_KEY;
    process.env.ISPAGENT_ENCRYPTION_KEY = 'outra-chave-completamente-diferente-0123456789';
    try {
      expect(tryDecryptSecret(stored)).toBeNull();
    } finally {
      process.env.ISPAGENT_ENCRYPTION_KEY = original;
    }
  });
});

describe('proteção contra SSRF (URL configurável por tenant)', () => {
  const original = process.env.ISPAGENT_ENV;
  afterEach(() => {
    process.env.ISPAGENT_ENV = original;
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://[fe80::1]/',
    'http://metadata.google.internal/',
    'ftp://exemplo.com/',
    'http://user:pass@exemplo.com/',
    'não é url',
  ])('bloqueia %s em qualquer ambiente', async (url) => {
    await expect(assertSafeOutboundUrl(url)).rejects.toThrow(UnsafeOutboundUrlError);
  });

  it('em desenvolvimento aceita host interno/localhost (PulseISP local)', async () => {
    process.env.ISPAGENT_ENV = 'development';
    await expect(assertSafeOutboundUrl('http://host.docker.internal:4000/api')).resolves.toBeInstanceOf(URL);
    await expect(assertSafeOutboundUrl('http://localhost:4000/api')).resolves.toBeInstanceOf(URL);
  });

  it('em produção exige https e bloqueia endereços internos', async () => {
    process.env.ISPAGENT_ENV = 'production';
    await expect(assertSafeOutboundUrl('http://api.exemplo.com/')).rejects.toThrow(/https/);
    await expect(assertSafeOutboundUrl('https://127.0.0.1/')).rejects.toThrow(/interno/);
    await expect(assertSafeOutboundUrl('https://10.0.0.5/')).rejects.toThrow(/interno/);
    await expect(assertSafeOutboundUrl('https://192.168.1.10/')).rejects.toThrow(/interno/);
    await expect(assertSafeOutboundUrl('https://localhost/')).rejects.toThrow(UnsafeOutboundUrlError);
    await expect(assertSafeOutboundUrl('https://[::ffff:10.0.0.5]/')).rejects.toThrow(/interno/);
  });

  it('em produção um IP público literal passa', async () => {
    process.env.ISPAGENT_ENV = 'production';
    await expect(assertSafeOutboundUrl('https://93.184.216.34/api')).resolves.toBeInstanceOf(URL);
  });
});

describe('minimização de CPF por papel', () => {
  it('SUPERVISOR+ vê o documento completo; abaixo só os 2 últimos dígitos', () => {
    expect(maskDocument('111.111.111-02', 'SUPERVISOR')).toBe('111.111.111-02');
    expect(maskDocument('111.111.111-02', 'TENANT_ADMIN')).toBe('111.111.111-02');
    expect(maskDocument('111.111.111-02', 'AGENT')).toBe('•••.•••.•••-02');
    expect(maskDocument('111.111.111-02', 'READ_ONLY')).toBe('•••.•••.•••-02');
    expect(maskDocument('11111111102', undefined)).toBe('•••••••••02');
  });
});
