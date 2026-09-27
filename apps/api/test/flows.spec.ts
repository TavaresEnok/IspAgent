import { randomUUID } from 'node:crypto';
import { FlowDefinition, starterFlow } from '@ispagent/shared';
import { runWithTenant } from '../src/common/tenant-context';
import { FlowsService } from '../src/flows/flows.service';
import { buildOrchestrator } from './helpers/build-orchestrator';

describe('construtor de fluxo — atendimento real', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  let flows: FlowsService;
  const TENANT = 'tnt_demo_alpha';
  const OTHER = 'tnt_demo_beta';
  const USER = 'usr_teste_fluxo';
  const created: string[] = [];

  const inTenant = <T>(fn: () => Promise<T>, tenant = TENANT) => runWithTenant(tenant, fn);

  beforeAll(async () => {
    ctx = await buildOrchestrator();
    flows = new FlowsService(ctx.db);
  });

  afterEach(async () => {
    // Nenhum fluxo de teste pode ficar ativo: os outros testes do tenant dependem do atendimento sem fluxo.
    await ctx.prisma.conversationFlow.updateMany({ where: { id: { in: created } }, data: { active: false } });
  });

  afterAll(async () => {
    await ctx.prisma.conversationFlow.deleteMany({ where: { id: { in: created } } });
    await ctx.prisma.$disconnect();
  });

  async function publishedActive(def: FlowDefinition = starterFlow(), tenant = TENANT) {
    return inTenant(async () => {
      const flow = await flows.create(`Fluxo ${randomUUID().slice(0, 6)}`, USER);
      created.push(flow.id);
      await flows.saveDraft(flow.id, { definition: def }, USER);
      await flows.publish(flow.id, USER);
      await flows.setActive(flow.id, true, USER);
      return flow.id;
    }, tenant);
  }

  const newConversation = () =>
    inTenant(() =>
      ctx.db.client.conversation.create({
        data: { tenantId: TENANT, channel: 'WEBCHAT', channelUserId: `wc_${randomUUID()}`, status: 'AI_ACTIVE' },
      }),
    );

  const ask = (conversationId: string, message: string) => inTenant(() => ctx.orchestrator.handleMessage(conversationId, message));

  const agentMessages = (conversationId: string) =>
    inTenant(async () =>
      (
        await ctx.db.client.message.findMany({ where: { conversationId, role: 'AGENT' }, orderBy: { createdAt: 'asc' } })
      ).map((m) => m.content),
    );

  it('fluxo ativo conduz: menu → CPF → identificação real → fatura pela ferramenta → fim; depois a IA segue', async () => {
    await publishedActive();
    const conv = await newConversation();

    const t1 = await ask(conv.id, 'oi');
    expect(t1?.model).toMatch(/^fluxo v1/);
    const first = await agentMessages(conv.id);
    expect(first[1]).toContain('1. 2ª via da fatura');

    await ask(conv.id, '1');
    const t3 = await ask(conv.id, '111.111.111-02');
    expect(t3?.identity?.customerId).toBe('cus_demo_b');
    const calls = await inTenant(() => ctx.db.client.toolCall.findMany({ where: { agentRunId: t3!.agentRunId } }));
    expect(calls.map((c) => c.tool)).toContain('BillingTool');

    const stored = await inTenant(() => ctx.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }));
    expect((stored.flowState as { status: string }).status).toBe('done');
    expect(stored.customerId).toBe('cus_demo_b');

    // Fluxo terminou: a próxima mensagem já é o atendimento normal (IA), não o fluxo.
    const after = await ask(conv.id, 'qual o meu plano?');
    expect(after?.model).not.toMatch(/^fluxo/);
  });

  it('bloco de transferência abre o atendimento humano no setor escolhido', async () => {
    await publishedActive();
    const conv = await newConversation();
    await ask(conv.id, 'oi');
    await ask(conv.id, '1');
    const t = await ask(conv.id, '999.999.999-99'); // não existe → "não encontrado" → financeiro
    expect(t?.outcome).toBe('HANDOFF');
    const handoff = await inTenant(() => ctx.db.client.handoff.findFirstOrThrow({ where: { conversationId: conv.id } }));
    expect(handoff.department).toBe('FINANCEIRO');
  });

  it('sem fluxo ativo o atendimento é o de sempre; conversa já em andamento não é interrompida', async () => {
    const conv = await newConversation();
    const before = await ask(conv.id, 'oi');
    expect(before?.model).not.toMatch(/^fluxo/);

    await publishedActive();
    const later = await ask(conv.id, 'minha fatura');
    expect(later?.model).not.toMatch(/^fluxo/);
  });

  it('fluxo com erro não publica; só um fluxo ativo por provedor', async () => {
    await inTenant(async () => {
      const broken = await flows.create('Quebrado', USER);
      created.push(broken.id);
      const def = starterFlow();
      def.edges = def.edges.filter((e) => e.source !== 'boas_vindas');
      await flows.saveDraft(broken.id, { definition: def }, USER);
      await expect(flows.publish(broken.id, USER)).rejects.toThrow(/erros/);
      await expect(flows.setActive(broken.id, true, USER)).rejects.toThrow(/Publique/);
    });

    const a = await publishedActive();
    const b = await publishedActive();
    const active = await inTenant(() => ctx.db.client.conversationFlow.findMany({ where: { active: true, id: { in: [a, b] } } }));
    expect(active.map((f) => f.id)).toEqual([b]);
  });

  it('o fluxo de um provedor não aparece nem vale para outro', async () => {
    const id = await publishedActive();
    const otherList = await inTenant(() => flows.list(), OTHER);
    expect(otherList.map((f) => f.id)).not.toContain(id);
    await expect(inTenant(() => flows.get(id), OTHER)).rejects.toThrow(/não encontrado/);
  });

  it('rascunho com estrutura adulterada é recusado ao salvar', async () => {
    await inTenant(async () => {
      const flow = await flows.create('Adulterado', USER);
      created.push(flow.id);
      await expect(
        flows.saveDraft(flow.id, { definition: { nodes: [{ id: 'x', type: 'exec_shell', position: { x: 0, y: 0 }, data: {} }], edges: [], startNodeId: 'x' } }, USER),
      ).rejects.toThrow(/tipo de bloco desconhecido/);
    });
  });
});
