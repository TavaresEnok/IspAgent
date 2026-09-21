import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PulseIspClient, PulseIspError } from '../integrations/pulseisp/pulseisp-client.service';
import { PulseIspMirrorService } from '../integrations/pulseisp/pulseisp-mirror.service';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { runWithTenant } from '../common/tenant-context';
import { Public } from '../common/decorators/public.decorator';

class WebchatMessageDto {
  @IsString()
  @MinLength(1)
  channelUserId!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}

/**
 * Web Chat DEMO (seção 6.3): canal obrigatório, 100% local, sem serviço externo. Público (sem JWT) —
 * quem identifica o tenant é o segmento `:tenantId` da URL, não um token de staff. O `channelUserId`
 * (telefone digitado pelo "cliente" no widget) é o mesmo sinal que `IdentityResolutionService` usa —
 * é assim que a Fase 3 resolve para `cus_demo_a`/etc dentro do DEMO.
 */
@Controller('public/webchat')
export class WebchatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly pulse: PulseIspClient,
    private readonly mirror: PulseIspMirrorService,
  ) {}

  // Web Chat de teste: escolher o provedor (ex.: Vibe), buscar um cliente do PulseISP dele e conversar
  // "como" esse cliente — sem precisar do painel.
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':tenantId/pulse-customers')
  async pulseCustomers(@Param('tenantId') tenantId: string, @Query('search') search = '') {
    await this.requireTenant(tenantId);
    if (search.trim().length < 2) throw new BadRequestException('Digite pelo menos 2 caracteres.');
    return runWithTenant(tenantId, async () => {
      try {
        return await this.pulse.searchCustomers(tenantId, search);
      } catch (err) {
        throw pulseError(err);
      }
    });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':tenantId/pulse-simulate')
  async pulseSimulate(@Param('tenantId') tenantId: string, @Body() body: { customerId?: string }) {
    await this.requireTenant(tenantId);
    if (!body?.customerId) throw new BadRequestException('customerId obrigatório.');
    return runWithTenant(tenantId, async () => {
      try {
        const c360 = await this.pulse.customer360(tenantId, body.customerId as string);
        return await this.mirror.upsertFromCustomer360(tenantId, c360);
      } catch (err) {
        throw pulseError(err);
      }
    });
  }

  // Toda mensagem aciona classifyIntent + possivelmente composeReply (LLM real, quando configurado) +
  // execução de ferramenta — sem limite, é uma rota pública que vira máquina de gastar tokens/dinheiro.
  // 20 mensagens por minuto por IP é generoso pra um humano testando, apertado pra um script abusando.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':tenantId/message')
  async sendMessage(@Param('tenantId') tenantId: string, @Body() dto: WebchatMessageDto) {
    await this.requireTenant(tenantId);

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WEBCHAT', dto.channelUserId);
      const decision = await this.orchestrator.handleMessage(conv.id, dto.message);
      const [messages, refreshed] = await Promise.all([
        this.db.client.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
        this.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      ]);
      // `status` fresco (não o `conv` capturado antes de handleMessage rodar) — o Web Chat usa isto
      // pra saber, sem precisar recarregar a página, que a IA parou de responder (HUMAN_ACTIVE) ou que
      // a conversa entrou na fila humana (HANDOFF_PENDING).
      return { conversationId: conv.id, decision, messages, status: refreshed.status };
    });
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':tenantId/conversation/:channelUserId')
  async getConversation(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
  ) {
    await this.requireTenant(tenantId);

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WEBCHAT', channelUserId);
      const messages = await this.db.client.message.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
      });
      return { conversationId: conv.id, status: conv.status, messages };
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete(':tenantId/conversation/:channelUserId')
  async resetConversation(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
  ) {
    await this.requireTenant(tenantId);

    return runWithTenant(tenantId, async () => {
      const existing = await this.db.client.conversation.findMany({
        where: { channel: 'WEBCHAT', channelUserId },
      });

      // Mesma ordem de limpeza segura de FK usada em test/conversation.spec.ts (resetConversationsFor):
      // ToolCall -> AgentRun/Handoff -> Message -> Conversation. Botão "Resetar" do Web Chat DEMO
      // (seção 6.3): reinicia o teste ponta a ponta sem depender de WhatsApp nem de outro telefone.
      for (const conv of existing) {
        const runs = await this.db.client.agentRun.findMany({ where: { conversationId: conv.id } });
        for (const run of runs) {
          await this.db.client.toolCall.deleteMany({ where: { agentRunId: run.id } });
        }
        await this.db.client.agentRun.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.handoff.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.message.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.conversation.delete({ where: { id: conv.id } });
      }

      return { reset: true, conversationsRemoved: existing.length };
    });
  }

  private async requireTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return tenant;
  }
}

function pulseError(err: unknown): Error {
  if (err instanceof PulseIspError) return new BadRequestException(err.message);
  return err instanceof Error ? err : new Error(String(err));
}
