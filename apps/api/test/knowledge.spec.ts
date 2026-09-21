import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { createKnowledgeSearchTool } from '../src/knowledge/knowledge-tool';
import { runWithTenant } from '../src/common/tenant-context';
import { createTestAgentRun } from './helpers/agent-run';

/**
 * Knowledge Base via full-text search real do Postgres (não embeddings/serviço externo — DECISIONS.md).
 */
describe('Knowledge Base', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let knowledge: KnowledgeService;
  let executor: ToolExecutorService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    knowledge = new KnowledgeService(db);
    executor = new ToolExecutorService(db, new PolicyEngineService(db));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('encontra o documento de KB sobre internet lenta por palavra-chave', async () => {
    const results = await runWithTenant('tnt_demo_alpha', () => knowledge.search('internet lenta roteador'));
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === 'kb_demo_internet_lenta')).toBe(true);
  });

  it('busca sem correspondência devolve lista vazia, nunca resultado fabricado', async () => {
    const results = await runWithTenant('tnt_demo_alpha', () =>
      knowledge.search('assunto completamente fora do domínio xyzabc123'),
    );
    expect(results).toHaveLength(0);
  });

  it('busca é isolada por tenant: Beta não encontra documentos do Alpha', async () => {
    const results = await runWithTenant('tnt_demo_beta', () => knowledge.search('internet lenta'));
    expect(results).toHaveLength(0);
  });

  it('KnowledgeTool executa pelo pipeline padrão e devolve facts citáveis', async () => {
    const tool = createKnowledgeSearchTool(knowledge);

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(tool, { query: 'segunda via fatura' }, { agentRunId });
    });

    expect(result.status).toBe('OK');
    expect(result.facts.length).toBeGreaterThan(0);
  });

  it('KnowledgeTool devolve NOT_FOUND quando não há documento relevante', async () => {
    const tool = createKnowledgeSearchTool(knowledge);

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(tool, { query: 'assunto totalmente irrelevante xyzabc123' }, { agentRunId });
    });

    expect(result.status).toBe('NOT_FOUND');
  });
});
