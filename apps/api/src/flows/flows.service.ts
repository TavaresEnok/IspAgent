import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  FLOW_LIMITS,
  FLOW_SCHEMA_VERSION,
  FlowDefinition,
  FlowIssue,
  FlowNodeType,
  flowHasErrors,
  starterFlow,
  validateFlow,
} from '@ispagent/shared';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';

const NODE_TYPES: FlowNodeType[] = [
  'start', 'message', 'menu', 'ask', 'identify', 'lookup', 'ticket', 'condition', 'ai', 'handoff', 'end',
];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Teto do JSON salvo: 200 blocos com texto longo cabem com folga. */
const MAX_DEFINITION_BYTES = 512 * 1024;

/**
 * Checagem ESTRUTURAL do que chega do navegador (tipos, ids, tamanhos) antes de gravar. A validação de
 * negócio (saídas ligadas, laços, textos) é `validateFlow`, que o editor também roda: um rascunho pode ter
 * esses problemas; só a publicação exige que não haja nenhum.
 */
export function sanitizeDefinition(raw: unknown): FlowDefinition {
  const bad = (msg: string): never => {
    throw new BadRequestException(`Fluxo inválido: ${msg}`);
  };
  if (JSON.stringify(raw ?? null).length > MAX_DEFINITION_BYTES) bad('grande demais.');
  const d = raw as Partial<FlowDefinition>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) bad('estrutura ausente.');
  if (d.nodes!.length > FLOW_LIMITS.maxNodes || d.edges!.length > FLOW_LIMITS.maxEdges) bad('blocos ou conexões demais.');
  if (typeof d.startNodeId !== 'string' || !ID_RE.test(d.startNodeId)) bad('bloco de início ausente.');

  const nodes = d.nodes!.map((n) => {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !ID_RE.test(n.id)) bad('bloco com identificador inválido.');
    if (!NODE_TYPES.includes(n.type)) bad(`tipo de bloco desconhecido (${String(n.type).slice(0, 20)}).`);
    const x = Number(n.position?.x);
    const y = Number(n.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) bad('bloco sem posição.');
    if (!n.data || typeof n.data !== 'object' || Array.isArray(n.data)) bad('bloco sem configuração.');
    return { id: n.id, type: n.type, position: { x: Math.round(x), y: Math.round(y) }, data: n.data } as FlowDefinition['nodes'][number];
  });
  const edges = d.edges!.map((e) => {
    for (const k of ['id', 'source', 'sourceHandle', 'target'] as const) {
      if (typeof e?.[k] !== 'string' || !ID_RE.test(e[k])) bad('conexão inválida.');
    }
    return { id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target };
  });
  const settings = {
    humanRequestInterrupt: d.settings?.humanRequestInterrupt !== false,
    maxRetries: Math.min(5, Math.max(0, Math.round(Number(d.settings?.maxRetries ?? 2)) || 0)),
  };
  return { schemaVersion: FLOW_SCHEMA_VERSION, startNodeId: d.startNodeId!, settings, nodes, edges };
}

export interface FlowSummary {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  publishedVersion: number;
  publishedAt: Date | null;
  updatedAt: Date;
  /** O rascunho tem alterações ainda não publicadas. */
  draftChanged: boolean;
}

@Injectable()
export class FlowsService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(): Promise<FlowSummary[]> {
    const rows = await this.db.client.conversationFlow.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }] });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      active: r.active,
      publishedVersion: r.publishedVersion,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      draftChanged: JSON.stringify(r.definition) !== JSON.stringify(r.publishedDefinition),
    }));
  }

  async get(id: string) {
    const flow = await this.db.client.conversationFlow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundException('Fluxo não encontrado.');
    const definition = flow.definition as unknown as FlowDefinition;
    return {
      ...flow,
      draftChanged: JSON.stringify(flow.definition) !== JSON.stringify(flow.publishedDefinition),
      issues: validateFlow(definition),
    };
  }

  async create(name: string, userId: string, copyFromId?: string) {
    const definition = copyFromId
      ? ((await this.get(copyFromId)).definition as unknown as FlowDefinition)
      : starterFlow();
    return this.db.client.conversationFlow.create({
      data: {
        tenantId: currentTenantId() as string,
        name,
        definition: definition as unknown as Prisma.InputJsonValue,
        updatedById: userId,
      },
    });
  }

  async saveDraft(id: string, input: { name?: string; description?: string | null; definition?: unknown }, userId: string) {
    await this.get(id);
    const definition = input.definition === undefined ? undefined : sanitizeDefinition(input.definition);
    await this.db.client.conversationFlow.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(definition ? { definition: definition as unknown as Prisma.InputJsonValue } : {}),
        updatedById: userId,
      },
    });
    return this.get(id);
  }

  /** Publicar = o atendimento passa a usar esta versão. Só com zero erros. */
  async publish(id: string, userId: string) {
    const flow = await this.get(id);
    const issues: FlowIssue[] = flow.issues;
    if (flowHasErrors(issues)) {
      throw new UnprocessableEntityException({
        message: 'O fluxo tem erros e não pode ser publicado.',
        issues: issues.filter((i) => i.severity === 'error'),
      });
    }
    const version = flow.publishedVersion + 1;
    await this.db.client.conversationFlow.update({
      where: { id },
      data: {
        publishedDefinition: flow.definition as Prisma.InputJsonValue,
        publishedVersion: version,
        publishedAt: new Date(),
        updatedById: userId,
      },
    });
    await this.audit(userId, 'flow.published', id, { version, name: flow.name });
    return this.get(id);
  }

  /** Um fluxo ativo por tenant: ativar um desativa os outros (o banco também garante isso). */
  async setActive(id: string, active: boolean, userId: string) {
    const flow = await this.get(id);
    if (active && !flow.publishedDefinition) {
      throw new BadRequestException('Publique o fluxo antes de ativá-lo.');
    }
    await this.db.client.$transaction(async (tx) => {
      if (active) {
        await tx.conversationFlow.updateMany({ where: { active: true, NOT: { id } }, data: { active: false } });
      }
      await tx.conversationFlow.update({ where: { id }, data: { active } });
    });
    await this.audit(userId, active ? 'flow.activated' : 'flow.deactivated', id, { name: flow.name });
    return this.get(id);
  }

  async remove(id: string, userId: string) {
    const flow = await this.get(id);
    if (flow.active) throw new BadRequestException('Desative o fluxo antes de excluí-lo.');
    await this.db.client.conversationFlow.delete({ where: { id } });
    await this.audit(userId, 'flow.deleted', id, { name: flow.name });
    return { deleted: true };
  }

  /** Fluxo que o atendimento usa agora (só a versão publicada). */
  async activeFlow(): Promise<{ id: string; version: number; definition: FlowDefinition } | null> {
    const flow = await this.db.client.conversationFlow.findFirst({ where: { active: true } });
    if (!flow?.publishedDefinition) return null;
    return { id: flow.id, version: flow.publishedVersion, definition: flow.publishedDefinition as unknown as FlowDefinition };
  }

  private audit(userId: string, action: string, flowId: string, metadata: Record<string, unknown>) {
    return this.db.client.auditLog.create({
      data: {
        tenantId: currentTenantId() as string,
        actorType: 'USER',
        actorId: userId,
        action,
        entityType: 'ConversationFlow',
        entityId: flowId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
