import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { runWithTenant } from '../src/common/tenant-context';
import { ErpConnectionService } from '../src/integrations/erp/erp-connection.service';
import { SgpClientService } from '../src/integrations/erp/sgp-client.service';
import { TenantErpAdapter } from '../src/integrations/erp/tenant-erp.adapter';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { SGPAdapter } from '../src/integrations/erp/sgp.adapter';
import { PlatformController } from '../src/platform/platform.controller';
import { BrandingController } from '../src/platform/branding.controller';
import { TenantAccessService } from '../src/platform/tenant-access.service';
import { UsersController } from '../src/users/users.controller';
import { AuthService } from '../src/auth/auth.service';
import { buildOrchestrator } from './helpers/build-orchestrator';

// Provedores só desta suíte: as outras rodam em paralelo no mesmo banco e não podem ver ERP/limites mudarem.
const ALPHA = 'tnt_saas_a';
const BETA = 'tnt_saas_b';
const ADMIN_A = 'usr_saas_admin_a';
const superReq = { user: { userId: 'usr_super_teste', tenantId: ALPHA, role: 'SUPER_ADMIN', email: 's@x' } } as never;

describe('SaaS multi-provedor', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  const createdTenants: string[] = [];

  beforeAll(async () => {
    ctx = await buildOrchestrator();
    for (const [id, slug] of [[ALPHA, 'saas-a'], [BETA, 'saas-b']]) {
      await ctx.prisma.tenant.upsert({ where: { id }, create: { id, name: `Suíte ${slug}`, brandName: `Suíte ${slug}`, slug }, update: {} });
      await ctx.prisma.tenantPolicyConfig.upsert({ where: { tenantId: id }, create: { tenantId: id, companyName: `Suíte ${slug}` }, update: {} });
    }
    await ctx.prisma.user.upsert({
      where: { id: ADMIN_A },
      create: { id: ADMIN_A, tenantId: ALPHA, email: 'admin@saas-a.test', name: 'Admin A', role: 'TENANT_ADMIN', passwordHash: 'x' },
      update: { active: true },
    });
  });

  afterAll(async () => {
    for (const id of createdTenants) {
      await ctx.prisma.refreshToken.deleteMany({ where: { user: { tenantId: id } } });
      await ctx.prisma.user.deleteMany({ where: { tenantId: id } });
      await ctx.prisma.erpConnection.deleteMany({ where: { tenantId: id } });
      await ctx.prisma.tenantPolicyConfig.deleteMany({ where: { tenantId: id } });
      await ctx.prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await ctx.prisma.tenant.deleteMany({ where: { id } });
    }
    await ctx.prisma.erpConnection.deleteMany({ where: { tenantId: { in: [ALPHA, BETA] } } });
    await ctx.prisma.tenant.updateMany({ where: { id: ALPHA }, data: { monthlyConversationLimit: null, maxUsers: null, customDomain: null, brandLogo: null } });
    await ctx.prisma.$disconnect();
  });

  describe('ERP por provedor', () => {
    it('cada provedor usa o SEU SGP; quem não configurou fica na demonstração — nunca o SGP de outro', async () => {
      const connections = new ErpConnectionService(ctx.prisma);
      await connections.save(ALPHA, { provider: 'sgp', baseUrl: 'https://alpha.sgp.net.br', app: 'app-alpha', token: 'token-alpha' });

      const stored = await ctx.prisma.erpConnection.findUniqueOrThrow({ where: { tenantId: ALPHA } });
      expect(stored.token).toMatch(/^enc:v1:/);

      const sgpClient = new SgpClientService(undefined, connections);
      expect(await runWithTenant(ALPHA, () => sgpClient.getConfig())).toMatchObject({ baseUrl: 'https://alpha.sgp.net.br', app: 'app-alpha', token: 'token-alpha' });
      expect(await runWithTenant(BETA, () => sgpClient.isConfigured())).toBe(false);

      const adapter = new TenantErpAdapter(connections, new MockERPAdapter(ctx.db), new SGPAdapter(sgpClient, ctx.db));
      expect(await runWithTenant(ALPHA, async () => adapter.mode)).toBe('LIVE');
      expect(await runWithTenant(BETA, async () => adapter.mode)).toBe('DEMO');
    });

    it('SGP exige https e o nome do app; token em branco mantém o salvo só se a URL não mudou', async () => {
      const connections = new ErpConnectionService(ctx.prisma);
      await expect(connections.save(BETA, { provider: 'sgp', baseUrl: 'http://x.sgp.net.br', app: 'a', token: 't' })).rejects.toThrow(/https/);
      await connections.save(BETA, { provider: 'sgp', baseUrl: 'https://beta.sgp.net.br', app: 'app-beta', token: 't1' });
      await connections.save(BETA, { provider: 'sgp', baseUrl: 'https://beta.sgp.net.br', app: 'app-beta' });
      await expect(connections.save(BETA, { provider: 'sgp', baseUrl: 'https://outro.sgp.net.br', app: 'app-beta' })).rejects.toThrow(/token/);
      await connections.save(BETA, { provider: 'demo' });
      expect((await connections.resolve(BETA)).provider).toBe('demo');
    });
  });

  describe('painel da plataforma', () => {
    const platform = () => new PlatformController(ctx.prisma, new TenantAccessService(ctx.prisma));

    it('cria o provedor com admin, política e ERP de demonstração; senha inicial só aparece uma vez', async () => {
      const slug = `teste-${randomUUID().slice(0, 8)}`;
      const res = await platform().create({ name: 'Provedor Teste', slug, adminEmail: `admin@${slug}.test`, adminName: 'Admin' }, superReq);
      createdTenants.push(res.id);
      expect(res.admin.initialPassword.length).toBeGreaterThanOrEqual(12);
      const user = await ctx.prisma.user.findFirstOrThrow({ where: { tenantId: res.id } });
      expect(user.role).toBe('TENANT_ADMIN');
      expect(user.passwordHash).not.toContain(res.admin.initialPassword);
      expect(await ctx.prisma.erpConnection.findUnique({ where: { tenantId: res.id } })).toMatchObject({ provider: 'demo' });
      await expect(platform().create({ name: 'Outro', slug, adminEmail: 'x@y.test', adminName: 'X' }, superReq)).rejects.toThrow(/apelido/);
    });

    it('provedor suspenso não entra no painel (nem com a senha certa) e o Web Chat some', async () => {
      const slug = `susp-${randomUUID().slice(0, 8)}`;
      const created = await platform().create({ name: 'Suspenso', slug, adminEmail: `a@${slug}.test`, adminName: 'A' }, superReq);
      createdTenants.push(created.id);
      const auth = new AuthService(ctx.prisma, new JwtService({ secret: 'segredo-teste' }));

      await expect(auth.login(created.admin.email, created.admin.initialPassword)).resolves.toBeDefined();
      await platform().update(created.id, { status: 'SUSPENDED' }, superReq);
      await expect(auth.login(created.admin.email, created.admin.initialPassword)).rejects.toThrow(/suspenso/);
      expect(await new TenantAccessService(ctx.prisma).isActive(created.id)).toBe(false);
    });

    it('domínio próprio: formato válido e único', async () => {
      await expect(platform().update(ALPHA, { customDomain: 'não é domínio' }, superReq)).rejects.toThrow(/Domínio/);
      const domain = `atendimento-${randomUUID().slice(0, 6)}.alpha.test`;
      await platform().update(ALPHA, { customDomain: domain }, superReq);
      await expect(platform().update(BETA, { customDomain: domain }, superReq)).rejects.toThrow(/em uso/);
    });
  });

  describe('marca (white label)', () => {
    it('a marca pública vem pelo apelido ou pelo domínio próprio; desconhecido = marca da plataforma', async () => {
      const branding = new BrandingController(ctx.prisma);
      const bySlug = await branding.publicBranding('saas-a', { headers: {} } as never);
      expect(bySlug.tenantId).toBe(ALPHA);
      const domain = (await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: ALPHA } })).customDomain!;
      const byHost = await branding.publicBranding(undefined, { headers: { host: `${domain}:443` } } as never);
      expect(byHost.tenantId).toBe(ALPHA);
      const unknown = await branding.publicBranding('nao-existe', { headers: { host: 'x.test' } } as never);
      expect(unknown.tenantId).toBeNull();
    });

    it('logo só como imagem embutida (nada de script/HTML)', async () => {
      const branding = new BrandingController(ctx.prisma);
      const req = { user: { userId: 'u', tenantId: ALPHA, role: 'TENANT_ADMIN', email: 'x' } } as never;
      await expect(runWithTenant(ALPHA, () => branding.save({ brandLogo: 'data:text/html;base64,PHNjcmlwdD4=' }, req))).rejects.toThrow(/Logo/);
      const ok = await runWithTenant(ALPHA, () => branding.save({ brandColor: '#123abc', brandLogo: 'data:image/png;base64,iVBORw0KGgo=' }, req));
      expect(ok.color).toBe('#123abc');
    });
  });

  describe('operadores e limites do plano', () => {
    const adminReq = { user: { userId: 'usr_saas_admin_a', tenantId: ALPHA, role: 'TENANT_ADMIN', email: 'admin@alpha' } } as never;

    it('admin cadastra operador; não dá papel de plataforma; plano limita operadores ativos', async () => {
      const users = new UsersController(ctx.db, ctx.prisma);
      const created = await runWithTenant(ALPHA, () =>
        users.create({ email: `op-${randomUUID().slice(0, 6)}@alpha.test`, name: 'Operador', role: 'AGENT' }, adminReq),
      );
      expect(created.initialPassword).toBeDefined();
      await expect(
        runWithTenant(ALPHA, () => users.create({ email: 'x@alpha.test', name: 'X', role: 'SUPER_ADMIN' as never }, adminReq)),
      ).rejects.toThrow();

      const active = await ctx.prisma.user.count({ where: { tenantId: ALPHA, active: true } });
      await ctx.prisma.tenant.update({ where: { id: ALPHA }, data: { maxUsers: active } });
      await expect(
        runWithTenant(ALPHA, () => users.create({ email: `op2-${randomUUID().slice(0, 6)}@alpha.test`, name: 'Op2', role: 'AGENT' }, adminReq)),
      ).rejects.toThrow(/plano permite/);
      await ctx.prisma.tenant.update({ where: { id: ALPHA }, data: { maxUsers: null } });
      await ctx.prisma.user.delete({ where: { id: created.id } });
    });

    it('ninguém se desativa', async () => {
      const users = new UsersController(ctx.db, ctx.prisma);
      await expect(runWithTenant(ALPHA, () => users.update('usr_saas_admin_a', { active: false }, adminReq))).rejects.toThrow(/próprio/);
    });

    it('conversa acima do limite mensal: um aviso, fila humana, depois silêncio', async () => {
      const access = new TenantAccessService(ctx.prisma);
      // Ocupa a cota do mês: uma conversa já existente e o limite igual ao que o serviço conta (fuso BR).
      await runWithTenant(ALPHA, () =>
        ctx.db.client.conversation.create({ data: { tenantId: ALPHA, channel: 'WEBCHAT', channelUserId: `wc_${randomUUID()}`, status: 'CLOSED' } }),
      );
      const { conversationsThisMonth } = await access.usage(ALPHA);
      await ctx.prisma.tenant.update({ where: { id: ALPHA }, data: { monthlyConversationLimit: conversationsThisMonth } });
      const conv = await runWithTenant(ALPHA, () =>
        ctx.db.client.conversation.create({ data: { tenantId: ALPHA, channel: 'WEBCHAT', channelUserId: `wc_${randomUUID()}`, status: 'AI_ACTIVE' } }),
      );
      expect(await access.conversationBeyondLimit(ALPHA, conv.createdAt)).toBe(true);

      // O orquestrador com o serviço de acesso aplica o limite.
      (ctx.orchestrator as unknown as { access: TenantAccessService }).access = access;
      try {
        const first = await runWithTenant(ALPHA, () => ctx.orchestrator.handleMessage(conv.id, 'minha fatura'));
        expect(first?.outcome).toBe('HANDOFF');
        const second = await runWithTenant(ALPHA, () => ctx.orchestrator.handleMessage(conv.id, 'alô?'));
        expect(second).toBeNull();
      } finally {
        (ctx.orchestrator as unknown as { access?: TenantAccessService }).access = undefined;
        await ctx.prisma.tenant.update({ where: { id: ALPHA }, data: { monthlyConversationLimit: null } });
      }
    });
  });
});
