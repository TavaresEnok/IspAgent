import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { AiConfigService } from '../src/integrations/ai/ai-config.service';
import { AiProviderResolverService } from '../src/integrations/ai/ai-provider-resolver.service';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { AnthropicProvider } from '../src/integrations/ai/anthropic.provider';
import { GeminiProvider } from '../src/integrations/ai/gemini.provider';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * Tela "IA" do painel: a credencial de CADA provider fica salva lado a lado e o admin só escolhe qual
 * está ativo. Prova: (1) sem chave o resolver nunca quebra o turno (cai pro Mock); (2) trocar o provider
 * ativo não apaga nem mistura a chave dos outros; (3) a chave inteira nunca sai do backend; (4) o
 * botão "Testar" reporta falha sem chamar rede quando falta chave; (5) as tabelas de IA — que guardam
 * segredos — são isoladas por tenant na camada de dados.
 */
describe('AiConfigService / AiProviderResolverService', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let config: AiConfigService;
  let resolver: AiProviderResolverService;
  // Tenants DESCARTÁVEIS: estes testes apagam config de IA, e o tenant demo (tnt_demo_alpha) é o que o
  // usuário usa de verdade — rodar a suíte nunca pode apagar uma chave real salva pela tela "IA".
  const ALPHA = 'tnt_test_ai_a';
  const BETA = 'tnt_test_ai_b';

  const inAlpha = <T>(fn: () => Promise<T>) => runWithTenant(ALPHA, fn);

  async function wipe() {
    for (const tenant of [ALPHA, BETA]) {
      await runWithTenant(tenant, async () => {
        await db.client.aiProviderCredential.deleteMany({ where: { tenantId: tenant } });
        await db.client.aiProviderConfig.deleteMany({ where: { tenantId: tenant } });
      });
    }
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    config = new AiConfigService(db);
    resolver = new AiProviderResolverService(config, new MockAIProvider());
    for (const id of [ALPHA, BETA]) {
      await prisma.tenant.upsert({ where: { id }, create: { id, name: `Teste IA ${id}` }, update: {} });
    }
    await wipe();
  });

  afterEach(wipe);

  afterAll(async () => {
    await wipe();
    await prisma.tenant.deleteMany({ where: { id: { in: [ALPHA, BETA] } } });
    await prisma.$disconnect();
  });

  it('sem nenhuma config salva, o ativo é o Mock e resolve() devolve o MockAIProvider', async () => {
    const overview = await inAlpha(() => config.getOverview(ALPHA));
    expect(overview.active).toBe('mock');
    expect(overview.effective).toBe('mock');
    expect(await inAlpha(() => resolver.resolve(ALPHA))).toBeInstanceOf(MockAIProvider);
  });

  it('não deixa ativar um provider que exige chave sem chave salva', async () => {
    await expect(inAlpha(() => config.setActive(ALPHA, 'gemini'))).rejects.toThrow(/Salve a chave/);
  });

  it('salvar a chave NÃO ativa o provider; ativar é um passo separado', async () => {
    const saved = await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { apiKey: 'AIzaSy-chave-gemini-1234' }));
    expect(saved.active).toBe('mock');
    expect(await inAlpha(() => resolver.resolve(ALPHA))).toBeInstanceOf(MockAIProvider);

    const activated = await inAlpha(() => config.setActive(ALPHA, 'gemini'));
    expect(activated.active).toBe('gemini');
    expect(activated.effective).toBe('gemini');
    expect((await inAlpha(() => resolver.resolve(ALPHA))).name).toBe('GeminiProvider');
  });

  it('as credenciais de vários providers ficam salvas lado a lado e trocar o ativo não apaga nenhuma', async () => {
    await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { apiKey: 'chave-do-gemini-aaaa', model: 'gemini-2.0-flash' }));
    await inAlpha(() => config.saveCredential(ALPHA, 'anthropic', { apiKey: 'chave-do-claude-bbbb', model: 'claude-sonnet-5' }));

    await inAlpha(() => config.setActive(ALPHA, 'gemini'));
    expect((await inAlpha(() => resolver.resolve(ALPHA))).name).toBe('GeminiProvider');

    const overview = await inAlpha(() => config.setActive(ALPHA, 'anthropic'));
    expect((await inAlpha(() => resolver.resolve(ALPHA))).name).toBe('AnthropicProvider');

    // As duas continuam salvas, cada uma com o seu modelo.
    const gemini = overview.providers.find((p) => p.provider === 'gemini')!;
    const claude = overview.providers.find((p) => p.provider === 'anthropic')!;
    expect(gemini.hasApiKey && claude.hasApiKey).toBe(true);
    expect(gemini.model).toBe('gemini-2.0-flash');
    expect(claude.model).toBe('claude-sonnet-5');
    expect(gemini.isActive).toBe(false);
    expect(claude.isActive).toBe(true);
  });

  it('chave em branco mantém a chave já salva DAQUELE provider; clearApiKey remove', async () => {
    await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { apiKey: 'chave-persistente-1234' }));
    const kept = await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { model: 'gemini-1.5-flash' }));
    const card = kept.providers.find((p) => p.provider === 'gemini')!;
    expect(card.hasApiKey).toBe(true);
    expect(card.model).toBe('gemini-1.5-flash');

    const cleared = await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { clearApiKey: true }));
    expect(cleared.providers.find((p) => p.provider === 'gemini')!.hasApiKey).toBe(false);
  });

  it('a chave inteira nunca aparece na visão pra UI, só a versão mascarada', async () => {
    await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { apiKey: 'AIzaSy-segredo-nunca-deve-vazar-9876' }));
    const overview = await inAlpha(() => config.getOverview(ALPHA));
    expect(JSON.stringify(overview)).not.toContain('segredo-nunca-deve-vazar');
    const card = overview.providers.find((p) => p.provider === 'gemini')!;
    expect(card.maskedApiKey).toBe('AIza••••••••9876');
  });

  it('o ativo sem chave (chave removida depois) roda no Mock e o overview avisa via effective', async () => {
    await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { apiKey: 'chave-temporaria-1234' }));
    await inAlpha(() => config.setActive(ALPHA, 'gemini'));
    const overview = await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { clearApiKey: true }));
    expect(overview.active).toBe('gemini');
    expect(overview.effective).toBe('mock');
    expect(await inAlpha(() => resolver.resolve(ALPHA))).toBeInstanceOf(MockAIProvider);
  });

  it('Testar sem chave falha na hora, sem chamar rede; Testar o Mock passa', async () => {
    const noKey = await inAlpha(() => resolver.testConnection(ALPHA, 'gemini'));
    expect(noKey.ok).toBe(false);
    expect(noKey.error).toMatch(/chave/i);

    const mock = await inAlpha(() => resolver.testConnection(ALPHA, 'mock'));
    expect(mock.ok).toBe(true);
    expect(mock.sample?.intent).toBeDefined();
  });

  it('Testar OpenAI reporta "não implementado" em vez de fingir sucesso', async () => {
    const res = await inAlpha(() => resolver.testConnection(ALPHA, 'openai', { apiKey: 'qualquer' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/não implementado/i);
  });

  it('provider desconhecido é rejeitado', async () => {
    await expect(inAlpha(() => config.saveCredential(ALPHA, 'nao-existe', { apiKey: 'x' }))).rejects.toThrow(/desconhecido/i);
  });

  it('tenant B não enxerga a chave do tenant A e não consegue lê-la pedindo o tenantId de A', async () => {
    await inAlpha(() => config.saveCredential(ALPHA, 'gemini', { apiKey: 'AIzaSy-chave-do-alpha-0001' }));
    await inAlpha(() => config.setActive(ALPHA, 'gemini'));

    const betaView = await runWithTenant(BETA, () => config.getOverview(BETA));
    expect(betaView.active).toBe('mock');
    expect(betaView.providers.every((p) => !p.hasApiKey)).toBe(true);
    expect(await runWithTenant(BETA, () => resolver.resolve(BETA))).toBeInstanceOf(MockAIProvider);

    // Pedir explicitamente o tenantId de A de dentro do contexto de B é bloqueado pela camada de dados.
    await expect(runWithTenant(BETA, () => config.getOverview(ALPHA))).rejects.toThrow(/tenant-isolation/);
    await expect(runWithTenant(BETA, () => config.getCredential(ALPHA, 'gemini'))).rejects.toThrow(/tenant-isolation/);
  });
});
