import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_MS = 30_000;

export interface TenantUsage {
  conversationsThisMonth: number;
  aiTurnsThisMonth: number;
  activeUsers: number;
  monthlyConversationLimit: number | null;
  maxUsers: number | null;
}

/** Início do mês corrente no fuso do Brasil (o limite "por mês" do provedor vira à meia-noite de lá). */
export function monthStart(now = new Date()): Date {
  const br = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3));
}

/**
 * Situação comercial do provedor: ativo/suspenso e limites do plano. Suspenso não entra no painel e não
 * atende em nenhum canal; acima do limite mensal de conversas, a IA não atende conversas novas (vão
 * direto para a fila humana) — o provedor nunca fica mudo com o cliente.
 */
@Injectable()
export class TenantAccessService {
  private readonly status = new Map<string, { active: boolean; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async isActive(tenantId: string): Promise<boolean> {
    const hit = this.status.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.active;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
    const active = tenant?.status === 'ACTIVE';
    this.status.set(tenantId, { active, at: Date.now() });
    return active;
  }

  forget(tenantId: string) {
    this.status.delete(tenantId);
  }

  async usage(tenantId: string): Promise<TenantUsage> {
    const since = monthStart();
    const [tenant, conversationsThisMonth, aiTurnsThisMonth, activeUsers] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { monthlyConversationLimit: true, maxUsers: true } }),
      this.prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.agentRun.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { tenantId, active: true } }),
    ]);
    return {
      conversationsThisMonth,
      aiTurnsThisMonth,
      activeUsers,
      monthlyConversationLimit: tenant?.monthlyConversationLimit ?? null,
      maxUsers: tenant?.maxUsers ?? null,
    };
  }

  /** Passou do limite mensal de conversas (a conversa atual já conta). */
  async overConversationLimit(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { monthlyConversationLimit: true } });
    const limit = tenant?.monthlyConversationLimit;
    if (limit === null || limit === undefined) return false;
    const count = await this.prisma.conversation.count({ where: { tenantId, createdAt: { gte: monthStart() } } });
    return count > limit;
  }

  /**
   * Esta conversa passou do limite mensal do plano (as conversas criadas antes dela no mês já ocupam as
   * vagas). Conversas dentro do limite continuam normais mesmo depois que o limite é atingido.
   */
  async conversationBeyondLimit(tenantId: string, conversationCreatedAt: Date): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { monthlyConversationLimit: true } });
    const limit = tenant?.monthlyConversationLimit;
    if (limit === null || limit === undefined) return false;
    const since = monthStart();
    if (conversationCreatedAt < since) return false;
    const before = await this.prisma.conversation.count({ where: { tenantId, createdAt: { gte: since, lt: conversationCreatedAt } } });
    return before >= limit;
  }
}
