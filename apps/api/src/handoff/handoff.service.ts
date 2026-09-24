import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { HandoffSummary, ROLE_HIERARCHY, Role } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';
import { RealtimeEventsService } from '../events/events.service';

/**
 * Fila humana e transições AI → HUMAN → AI (seção 5.4). Quando o humano assume, a IA para de responder
 * naquela conversa — isso é aplicado em `AgentOrchestratorService.handleMessage` checando
 * `conversation.status`, não aqui; este serviço só é dono das transições de estado em si.
 *
 * Transições válidas: PENDING → ASSUMED → RETURNED_TO_AI. Cada uma é uma escrita condicional (só vale se
 * o handoff ainda está no estado de origem) dentro de uma transação, então dois atendentes clicando ao
 * mesmo tempo não assumem a mesma conversa e nunca sobra handoff/conversa em estados incoerentes.
 */
@Injectable()
export class HandoffService {
  constructor(
    private readonly db: TenantPrismaService,
    // Opcional: sem ele (testes, scripts) o handoff funciona igual, só não notifica o painel em tempo real.
    @Optional() private readonly events?: RealtimeEventsService,
  ) {}

  private requireTenantId(): string {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[HandoffService] requer contexto de tenant ativo.');
    return tenantId;
  }

  /**
   * Idempotente por conversa: se já existe um handoff `PENDING` para esta conversa, devolve ele em vez
   * de criar outro (evita duplicar entrada na fila quando vários turnos seguidos precisam de humano).
   */
  async createHandoff(conversationId: string, reason: string, summary: HandoffSummary, department?: string) {
    const tenantId = this.requireTenantId();

    const existing = await this.db.client.handoff.findFirst({
      where: { conversationId, status: 'PENDING' },
    });
    if (existing) return existing;

    const assignedDepartment = department || this.resolveDepartment(summary);

    const handoff = await this.db.client.$transaction(async (tx) => {
      const created = await tx.handoff.create({
        data: {
          tenantId,
          conversationId,
          reason,
          summary: summary as unknown as object,
          status: 'PENDING',
          department: assignedDepartment,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { status: 'HANDOFF_PENDING' },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorType: 'SYSTEM',
          action: 'handoff.created',
          entityType: 'Handoff',
          entityId: created.id,
          metadata: { conversationId, reason, department: assignedDepartment },
        },
      });

      return created;
    });

    // Evento em tempo real só depois do commit: o painel nunca vê um handoff que não existe.
    this.events?.emit({
      tenantId,
      type: 'NEW_HANDOFF',
      data: { handoffId: handoff.id, conversationId, reason, summary, department: assignedDepartment },
    });

    return handoff;
  }

  private resolveDepartment(summary?: HandoffSummary): string {
    const intent = summary?.intent;
    if (['FINANCEIRO', 'SEGUNDA_VIA', 'PAGAMENTO', 'BLOQUEIO'].includes(intent as any)) {
      return 'FINANCEIRO';
    }
    if (intent === 'CANCELAMENTO') {
      return 'RETENCAO';
    }
    if (['UPGRADE', 'CONTRATACAO', 'PLANO'].includes(intent as any)) {
      return 'COMERCIAL';
    }
    return 'SUPORTE_TECNICO';
  }

  async listQueue(status: 'PENDING' | 'ASSUMED' | 'RETURNED_TO_AI' | 'CLOSED' = 'PENDING', department?: string) {
    const where: any = { status };
    if (department && department !== 'ALL' && department !== 'TODOS') {
      where.department = department;
    }
    return this.db.client.handoff.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Humano assume a conversa: IA para de responder (conversation.status vira HUMAN_ACTIVE). */
  async assume(handoffId: string, userId: string) {
    const tenantId = this.requireTenantId();
    const handoff = await this.db.client.handoff.findUnique({ where: { id: handoffId } });
    if (!handoff) throw new NotFoundException('Handoff não encontrado');
    if (handoff.status !== 'PENDING') {
      throw new ConflictException(`Este handoff já está "${handoff.status}" e não pode ser assumido.`);
    }

    await this.db.client.$transaction(async (tx) => {
      const claimed = await tx.handoff.updateMany({
        where: { id: handoffId, status: 'PENDING' },
        data: { status: 'ASSUMED', assumedByUserId: userId, assumedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException('Outro atendente assumiu este handoff antes.');

      await tx.conversation.update({
        where: { id: handoff.conversationId },
        data: { status: 'HUMAN_ACTIVE' },
      });

      await tx.auditLog.create({
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
    });

    this.events?.emit({
      tenantId,
      type: 'STATUS_CHANGED',
      data: { conversationId: handoff.conversationId, status: 'HUMAN_ACTIVE', assumedByUserId: userId },
    });

    return this.db.client.handoff.findUniqueOrThrow({ where: { id: handoffId } });
  }

  /**
   * Devolve a conversa para a IA (AI → HUMAN → AI, seção 5.4) — auditado como as outras transições.
   * Só quem assumiu (ou um SUPERVISOR+) pode devolver.
   */
  async returnToAI(handoffId: string, userId: string, role?: string) {
    const tenantId = this.requireTenantId();
    const handoff = await this.db.client.handoff.findUnique({ where: { id: handoffId } });
    if (!handoff) throw new NotFoundException('Handoff não encontrado');
    if (handoff.status !== 'ASSUMED') {
      throw new ConflictException(`Só é possível devolver um handoff assumido (estado atual: "${handoff.status}").`);
    }
    const isOwner = handoff.assumedByUserId === userId;
    const isSupervisor = role !== undefined && ROLE_HIERARCHY[role as Role] >= ROLE_HIERARCHY.SUPERVISOR;
    if (!isOwner && !isSupervisor) {
      throw new ForbiddenException('Só quem assumiu a conversa (ou um supervisor) pode devolvê-la à IA.');
    }

    await this.db.client.$transaction(async (tx) => {
      const released = await tx.handoff.updateMany({
        where: { id: handoffId, status: 'ASSUMED' },
        data: { status: 'RETURNED_TO_AI', returnedAt: new Date() },
      });
      if (released.count === 0) throw new ConflictException('O handoff mudou de estado durante a operação.');

      await tx.conversation.update({
        where: { id: handoff.conversationId },
        data: { status: 'AI_ACTIVE' },
      });

      await tx.auditLog.create({
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
    });

    this.events?.emit({
      tenantId,
      type: 'STATUS_CHANGED',
      data: { conversationId: handoff.conversationId, status: 'AI_ACTIVE' },
    });

    return this.db.client.handoff.findUniqueOrThrow({ where: { id: handoffId } });
  }
}
