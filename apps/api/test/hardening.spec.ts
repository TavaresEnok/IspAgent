import { z } from 'zod';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { runWithTenant } from '../src/common/tenant-context';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { ErpToolsService } from '../src/tools/erp-tools.service';
import { HandoffService } from '../src/handoff/handoff.service';
import { AiConfigService } from '../src/integrations/ai/ai-config.service';
import { PulseIspConnectionService } from '../src/integrations/pulseisp/pulseisp-connection.service';
import { createTestAgentRun } from './helpers/agent-run';
import { ToolDefinition } from '../src/tools/tool.types';

const ALPHA = 'tnt_demo_alpha';
const BETA = 'tnt_demo_beta';
const T = 'tnt_test_hardening';

describe('hardening', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    await prisma.tenant.upsert({ where: { id: T }, update: {}, create: { id: T, name: 'Provedor Hardening' } });
    await prisma.tenantPolicyConfig.upsert({ where: { tenantId: T }, update: {}, create: { tenantId: T } });
  });

  afterAll(async () => {
    await prisma.aiProviderCredential.deleteMany({ where: { tenantId: T } });
    await prisma.aiProviderConfig.deleteMany({ where: { tenantId: T } });
    await prisma.pulseIspConnection.deleteMany({ where: { tenantId: T } });
    await prisma.toolCall.deleteMany({ where: { tenantId: T } });
    await prisma.agentRun.deleteMany({ where: { tenantId: T } });
    await prisma.handoff.deleteMany({ where: { tenantId: T } });
    await prisma.message.deleteMany({ where: { tenantId: T } });
    await prisma.conversation.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.tenantPolicyConfig.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
    await prisma.$disconnect();
  });

  describe('extensão de tenant: fail-closed', () => {
    it('createManyAndReturn respeita o tenant do contexto (antes passava sem filtro)', async () => {
      await expect(
        runWithTenant(ALPHA, () =>
          db.client.auditLog.createManyAndReturn({ data: [{ tenantId: BETA, actorType: 'SYSTEM', action: 'x' }] }),
        ),
      ).rejects.toThrow(/tenantId divergente/);

      const rows = await runWithTenant(T, () =>
        db.client.auditLog.createManyAndReturn({ data: [{ actorType: 'SYSTEM', action: 'teste.many' } as any] }),
      );
      expect(rows[0].tenantId).toBe(T);
    });

    it('upsert não consegue criar linha em outro tenant', async () => {
      await expect(
        runWithTenant(ALPHA, () =>
          db.client.plan.upsert({
            where: { id: 'plan_test_cross' },
            create: { id: 'plan_test_cross', tenantId: BETA, name: 'x', downloadMbps: 1, uploadMbps: 1, priceCents: 1 },
            update: {},
          }),
        ),
      ).rejects.toThrow(/tenantId divergente/);
    });

    it('upsert sem tenantId no create recebe o tenant do contexto', async () => {
      const plan = await runWithTenant(T, () =>
        db.client.plan.upsert({
          where: { id: 'plan_test_hardening' },
          create: { id: 'plan_test_hardening', name: 'x', downloadMbps: 1, uploadMbps: 1, priceCents: 1 } as any,
          update: {},
        }),
      );
      expect(plan.tenantId).toBe(T);
      await prisma.plan.delete({ where: { id: 'plan_test_hardening' } });
    });

    it('escrita aninhada de relação é recusada (não passaria pelo filtro de tenant)', async () => {
      await expect(
        runWithTenant(T, () =>
          db.client.conversation.create({
            data: {
              tenantId: T, channel: 'WEBCHAT', channelUserId: 'aninhado',
              messages: { create: { tenantId: BETA, role: 'CUSTOMER', content: 'x' } },
            } as any,
          }),
        ),
      ).rejects.toThrow(/aninhada/);
    });

    it('update não pode mover uma linha para outro tenant', async () => {
      const conv = await runWithTenant(T, () =>
        db.client.conversation.create({ data: { tenantId: T, channel: 'WEBCHAT', channelUserId: 'mover' } }),
      );
      await expect(
        runWithTenant(T, () => db.client.conversation.update({ where: { id: conv.id }, data: { tenantId: BETA } as any })),
      ).rejects.toThrow(/tenantId divergente/);
    });
  });

  describe('limites da policy são aplicados', () => {
    const erpTools = () => new ErpToolsService(new MockERPAdapter(db));
    const policy = () => new PolicyEngineService(db);

    it('maxToolCallsPerTurn: o turno que estourou a cota tem a ferramenta seguinte BLOQUEADA', async () => {
      await prisma.tenantPolicyConfig.update({ where: { tenantId: T }, data: { maxToolCallsPerTurn: 1 } });
      try {
        const executor = new ToolExecutorService(db, policy());
        const { first, second } = await runWithTenant(T, async () => {
          const agentRunId = await createTestAgentRun(db, 'limite-tools');
          const first = await executor.run(erpTools().billingTool, { contractId: 'ctt_nao_existe' }, { agentRunId });
          const second = await executor.run(erpTools().billingTool, { contractId: 'ctt_nao_existe' }, { agentRunId });
          return { first, second };
        });
        expect(first.status).not.toBe('BLOCKED_BY_POLICY');
        expect(second.status).toBe('BLOCKED_BY_POLICY');
        expect(second.error?.message).toContain('Limite de 1');
      } finally {
        await prisma.tenantPolicyConfig.update({ where: { tenantId: T }, data: { maxToolCallsPerTurn: 8 } });
      }
    });

    it('getLimits devolve o que o tenant configurou', async () => {
      await prisma.tenantPolicyConfig.update({ where: { tenantId: T }, data: { handoffAfterFailures: 5, maxTokensPerTurn: 900 } });
      try {
        const limits = await runWithTenant(T, () => policy().getLimits());
        expect(limits).toEqual({ maxToolCallsPerTurn: 8, maxTokensPerTurn: 900, handoffAfterFailures: 5 });
      } finally {
        await prisma.tenantPolicyConfig.update({ where: { tenantId: T }, data: { handoffAfterFailures: 3, maxTokensPerTurn: 6000 } });
      }
    });
  });

  describe('auditoria de ToolCall guarda os argumentos', () => {
    it('args gravados (antes era sempre {}) e valores de chaves sensíveis redigidos', async () => {
      const executor = new ToolExecutorService(db, new PolicyEngineService(db));
      const tool: ToolDefinition<{ q: string; apiKey: string }, unknown> = {
        name: 'ArgsProbeTool',
        action: 'knowledge.search',
        inputSchema: z.object({ q: z.string(), apiKey: z.string() }),
        adapter: 'test',
        capability: 'probe',
        mode: 'DEMO',
        execute: async () => ({ status: 'OK', facts: [] }),
      };
      const result = await runWithTenant(T, async () => {
        const agentRunId = await createTestAgentRun(db, 'args-audit');
        return executor.run(tool, { q: 'segunda via', apiKey: 'sk-segredo' }, { agentRunId });
      });
      const stored = await prisma.toolCall.findUniqueOrThrow({ where: { id: result.toolCallId } });
      expect(stored.args).toEqual({ q: 'segunda via', apiKey: '[redacted]' });
    });

    it('também grava os args quando a entrada é inválida (evidência do que foi tentado)', async () => {
      const executor = new ToolExecutorService(db, new PolicyEngineService(db));
      const erp = new ErpToolsService(new MockERPAdapter(db));
      const result = await runWithTenant(T, async () => {
        const agentRunId = await createTestAgentRun(db, 'args-invalid');
        return executor.run(erp.billingTool, { contractId: '' }, { agentRunId });
      });
      expect(result.status).toBe('INVALID_INPUT');
      const stored = await prisma.toolCall.findUniqueOrThrow({ where: { id: result.toolCallId } });
      expect(stored.args).toEqual({ contractId: '' });
    });
  });

  describe('handoff: transições válidas e atômicas', () => {
    const summary = {
      reason: 'teste', customerId: null, contractId: null, intent: 'OUTRO', reportedProblem: 'x',
      toolsConsulted: [], actionsTaken: [], actionsFailed: [], suggestedNextAction: 'y',
    };
    let handoff: HandoffService;
    beforeAll(() => {
      handoff = new HandoffService(db);
    });

    const newHandoff = () =>
      runWithTenant(T, async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: T, channel: 'WEBCHAT', channelUserId: `ho-${Math.random().toString(36).slice(2)}` },
        });
        return handoff.createHandoff(conv.id, 'teste', summary);
      });

    it('só é possível assumir um handoff PENDING; assumir de novo dá 409', async () => {
      const h = await newHandoff();
      await runWithTenant(T, () => handoff.assume(h.id, 'usr_a'));
      await expect(runWithTenant(T, () => handoff.assume(h.id, 'usr_b'))).rejects.toThrow(ConflictException);
    });

    it('dois atendentes assumindo AO MESMO TEMPO: exatamente um vence', async () => {
      const h = await newHandoff();
      const results = await Promise.allSettled([
        runWithTenant(T, () => handoff.assume(h.id, 'usr_a')),
        runWithTenant(T, () => handoff.assume(h.id, 'usr_b')),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });

    it('só quem assumiu (ou supervisor+) devolve para a IA; devolver o que não foi assumido dá 409', async () => {
      const h = await newHandoff();
      await expect(runWithTenant(T, () => handoff.returnToAI(h.id, 'usr_a', 'AGENT'))).rejects.toThrow(ConflictException);

      await runWithTenant(T, () => handoff.assume(h.id, 'usr_a'));
      await expect(runWithTenant(T, () => handoff.returnToAI(h.id, 'usr_b', 'AGENT'))).rejects.toThrow(ForbiddenException);

      const returned = await runWithTenant(T, () => handoff.returnToAI(h.id, 'usr_sup', 'SUPERVISOR'));
      expect(returned.status).toBe('RETURNED_TO_AI');
      const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: h.conversationId } });
      expect(conv.status).toBe('AI_ACTIVE');
    });
  });

  describe('credenciais de terceiros cifradas em repouso', () => {
    it('chave de IA: grava cifrada, a UI só vê máscara, o backend lê decifrada', async () => {
      const service = new AiConfigService(db);
      const overview = await runWithTenant(T, () =>
        service.saveCredential(T, 'gemini', { apiKey: 'AIzaSy-chave-super-secreta-9999', model: 'gemini-x' }),
      );
      const raw = await prisma.aiProviderCredential.findFirstOrThrow({ where: { tenantId: T, provider: 'gemini' } });
      expect(raw.apiKey).toMatch(/^enc:v1:/);
      expect(raw.apiKey).not.toContain('super-secreta');

      const card = overview.providers.find((p) => p.provider === 'gemini')!;
      expect(card.hasApiKey).toBe(true);
      expect(card.maskedApiKey).toBe('AIza••••••••9999');
      expect(JSON.stringify(overview)).not.toContain('super-secreta');

      const cred = await runWithTenant(T, () => service.getCredential(T, 'gemini'));
      expect(cred?.apiKey).toBe('AIzaSy-chave-super-secreta-9999');
    });

    it('salvar só o modelo (chave em branco) mantém a chave cifrada existente', async () => {
      const service = new AiConfigService(db);
      await runWithTenant(T, () => service.saveCredential(T, 'gemini', { apiKey: 'AIzaSy-chave-super-secreta-9999' }));
      await runWithTenant(T, () => service.saveCredential(T, 'gemini', { model: 'outro-modelo' }));
      const cred = await runWithTenant(T, () => service.getCredential(T, 'gemini'));
      expect(cred?.apiKey).toBe('AIzaSy-chave-super-secreta-9999');
      expect(cred?.model).toBe('outro-modelo');
    });

    it('chave LEGADA em texto puro continua funcionando e é regravada cifrada no primeiro acesso', async () => {
      await prisma.aiProviderCredential.upsert({
        where: { tenantId_provider: { tenantId: T, provider: 'anthropic' } },
        create: { tenantId: T, provider: 'anthropic', apiKey: 'sk-ant-legada-texto-puro', model: null },
        update: { apiKey: 'sk-ant-legada-texto-puro' },
      });
      const service = new AiConfigService(db);
      const first = await runWithTenant(T, () => service.getCredential(T, 'anthropic'));
      expect(first?.apiKey).toBe('sk-ant-legada-texto-puro');

      const raw = await prisma.aiProviderCredential.findFirstOrThrow({ where: { tenantId: T, provider: 'anthropic' } });
      expect(raw.apiKey).toMatch(/^enc:v1:/);
      const second = await runWithTenant(T, () => service.getCredential(T, 'anthropic'));
      expect(second?.apiKey).toBe('sk-ant-legada-texto-puro');
    });

    it('PulseISP: senha cifrada em repouso, lida decifrada, e URL de metadata/SSRF é recusada', async () => {
      const service = new PulseIspConnectionService(db);
      await expect(
        runWithTenant(T, () => service.save(T, { baseUrl: 'http://169.254.169.254/latest', email: 'a@b.com', password: 'x' })),
      ).rejects.toThrow(BadRequestException);

      const view = await runWithTenant(T, () =>
        service.save(T, { baseUrl: 'https://pulse.exemplo.com.br/api/', email: 'Admin@Exemplo.com', password: 'senha-do-pulse-123' }),
      );
      expect(view).toMatchObject({ configured: true, baseUrl: 'https://pulse.exemplo.com.br/api', email: 'admin@exemplo.com', hasPassword: true });

      const raw = await prisma.pulseIspConnection.findUniqueOrThrow({ where: { tenantId: T } });
      expect(raw.password).toMatch(/^enc:v1:/);
      const decrypted = await runWithTenant(T, () => service.getRaw(T));
      expect(decrypted?.password).toBe('senha-do-pulse-123');

      // trocar só a URL mantém a senha (mesmo e-mail)
      await runWithTenant(T, () => service.save(T, { baseUrl: 'https://outro.exemplo.com.br/api', email: 'admin@exemplo.com' }));
      expect((await runWithTenant(T, () => service.getRaw(T)))?.password).toBe('senha-do-pulse-123');
    });
  });
});
