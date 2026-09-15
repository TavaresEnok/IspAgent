import { Controller, Get } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

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
    ]);

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
}
