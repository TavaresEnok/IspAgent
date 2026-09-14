import { Injectable, NotFoundException } from '@nestjs/common';
import { HandoffSummary } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';

/**
 * Fila humana e transições AI → HUMAN → AI (seção 5.4). Quando o humano assume, a IA para de responder
 * naquela conversa — isso é aplicado em `AgentOrchestratorService.handleMessage` checando
 * `conversation.status`, não aqui; este serviço só é dono das transições de estado em si.
 */
@Injectable()
export class HandoffService {
  constructor(private readonly db: TenantPrismaService) {}

  private requireTenantId(): string {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[HandoffService] requer contexto de tenant ativo.');
    return tenantId;
  }

  /**
   * Idempotente por conversa: se já existe um handoff `PENDING` para esta conversa, devolve ele em vez
   * de criar outro (evita duplicar entrada na fila quando vários turnos seguidos precisam de humano).
   */
  async createHandoff(conversationId: string, reason: string, summary: HandoffSummary) {
    const tenantId = this.requireTenantId();

    const existing = await this.db.client.handoff.findFirst({
      where: { conversationId, status: 'PENDING' },
    });
    if (existing) return existing;

    const handoff = await this.db.client.handoff.create({
      data: {
        tenantId,
        conversationId,
        reason,
        summary: summary as unknown as object,
        status: 'PENDING',
      },
    });

    await this.db.client.conversation.update({
      where: { id: conversationId },
      data: { status: 'HANDOFF_PENDING' },
    });

    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'SYSTEM',
        action: 'handoff.created',
        entityType: 'Handoff',
        entityId: handoff.id,
        metadata: { conversationId, reason },
      },
    });

    return handoff;
  }

  async listQueue(status: 'PENDING' | 'ASSUMED' | 'RETURNED_TO_AI' | 'CLOSED' = 'PENDING') {
    return this.db.client.handoff.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Humano assume a conversa: IA para de responder (conversation.status vira HUMAN_ACTIVE). */
  async assume(handoffId: string, userId: string) {
    const tenantId = this.requireTenantId();
    const handoff = await this.db.client.handoff.findUnique({ where: { id: handoffId } });
    if (!handoff) throw new NotFoundException('Handoff não encontrado');

    const updated = await this.db.client.handoff.update({
      where: { id: handoffId },
      data: { status: 'ASSUMED', assumedByUserId: userId, assumedAt: new Date() },
    });

    await this.db.client.conversation.update({
      where: { id: handoff.conversationId },
      data: { status: 'HUMAN_ACTIVE' },
    });

    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: userId,
        action: 'handoff.assumed',
        entityType: 'Handoff',
        entityId: handoffId,
        metadata: { conversationId: handoff.conversationId },
      },
    });

    return updated;
  }

  /** Devolve a conversa para a IA (AI → HUMAN → AI, seção 5.4) — auditado como as outras transições. */
  async returnToAI(handoffId: string, userId: string) {
    const tenantId = this.requireTenantId();
    const handoff = await this.db.client.handoff.findUnique({ where: { id: handoffId } });
    if (!handoff) throw new NotFoundException('Handoff não encontrado');

    const updated = await this.db.client.handoff.update({
      where: { id: handoffId },
      data: { status: 'RETURNED_TO_AI', returnedAt: new Date() },
    });

    await this.db.client.conversation.update({
      where: { id: handoff.conversationId },
      data: { status: 'AI_ACTIVE' },
    });

    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: userId,
        action: 'handoff.returned_to_ai',
        entityType: 'Handoff',
        entityId: handoffId,
        metadata: { conversationId: handoff.conversationId },
      },
    });

    return updated;
  }
}
