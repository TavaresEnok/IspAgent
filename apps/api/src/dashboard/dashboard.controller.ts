import { Controller, Get } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Métricas reais (seção 10.2) — tudo aqui vem de agregação direta sobre AgentRun/Conversation/ToolCall/
 * Handoff. Nenhum número "estimado" sem base (a seção proíbe "economia estimada" sem base — por isso
 * este dashboard não tem nenhum campo desse tipo).
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get('metrics')
  async metrics() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      conversationsToday,
      answeredToday,
      handoffToday,
      totalToolCalls,
      okToolCalls,
      blockedToolCalls,
      upstreamErrorToolCalls,
      ticketsCreated,
      pulseIspCalls,
      agentRunsToday,
      surveys,
      commercialLeadsCount,
      cancellationsCount,
      cancellationsRetainedCount,
    ] = await Promise.all([
      this.db.client.conversation.count({ where: { createdAt: { gte: startOfDay } } }),
      this.db.client.agentRun.count({ where: { createdAt: { gte: startOfDay }, outcome: 'ANSWERED' } }),
      this.db.client.agentRun.count({ where: { createdAt: { gte: startOfDay }, outcome: 'HANDOFF' } }),
      this.db.client.toolCall.count(),
      this.db.client.toolCall.count({ where: { status: 'OK' } }),
      this.db.client.toolCall.count({ where: { status: 'BLOCKED_BY_POLICY' } }),
      this.db.client.toolCall.count({ where: { status: { in: ['UPSTREAM_ERROR', 'TIMEOUT'] } } }),
      this.db.client.toolCall.count({
        where: { tool: 'SupportTool', status: 'OK', source: { path: ['capability'], equals: 'create_ticket' } },
      }),
      this.db.client.toolCall.count({ where: { tool: 'PulseISPTool' } }),
      this.db.client.agentRun.findMany({
        where: { createdAt: { gte: startOfDay } },
        select: { intent: true },
      }),
      this.db.client.satisfactionSurvey.findMany({
        select: { score: true },
      }),
      this.db.client.commercialLead.count(),
      this.db.client.cancellationRequest.count(),
      this.db.client.cancellationRequest.count({ where: { status: 'RETAINED' } }),
    ]);

    const csatTotal = surveys.length;
    // Sem avaliação não há nota: `null` (a tela mostra "sem dados"), nunca um 5,0 presumido.
    const csatAverage = csatTotal > 0 ? Number((surveys.reduce((acc, s) => acc + s.score, 0) / csatTotal).toFixed(1)) : null;
    const deflectionRate = conversationsToday > 0
      ? Number((((conversationsToday - handoffToday) / conversationsToday) * 100).toFixed(1))
      : null;

    const intentCounts = agentRunsToday.reduce<Record<string, number>>((acc, run) => {
      acc[run.intent] = (acc[run.intent] ?? 0) + 1;
      return acc;
    }, {});
    const topIntents = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([intent, count]) => ({ intent, count }));

    return {
      conversationsToday,
      answeredByAiToday: answeredToday,
      handedOffToday: handoffToday,
      deflectionRate,
      csat: {
        average: csatAverage,
        totalSurveys: csatTotal,
      },
      commercialLeads: commercialLeadsCount,
      retention: {
        total: cancellationsCount,
        retained: cancellationsRetainedCount,
      },
      topIntents,
      ticketsCreated,
      toolCalls: {
        total: totalToolCalls,
        ok: okToolCalls,
        successRate: totalToolCalls > 0 ? Number((okToolCalls / totalToolCalls).toFixed(3)) : null,
        blockedByPolicy: blockedToolCalls,
        integrationErrors: upstreamErrorToolCalls,
      },
      pulseIspDiagnosticsUsed: pulseIspCalls,
      observedAt: new Date().toISOString(),
    };
  }

  // Leads e cancelamentos têm nome/telefone do cliente: mesmo nível de leitura das conversas.
  @Get('leads')
  @Roles('ANALYST')
  async listLeads() {
    return this.db.client.commercialLead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('cancellations')
  @Roles('ANALYST')
  async listCancellations() {
    return this.db.client.cancellationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
