import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
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
  ) {}

  @Public()
  @Post(':tenantId/message')
  async sendMessage(@Param('tenantId') tenantId: string, @Body() dto: WebchatMessageDto) {
    await this.requireTenant(tenantId);

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WEBCHAT', dto.channelUserId);
      const decision = await this.orchestrator.handleMessage(conv.id, dto.message);
      const messages = await this.db.client.message.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
      });
      return { conversationId: conv.id, decision, messages };
    });
  }

  @Public()
  @Get(':tenantId/conversation/:channelUserId')
  async getConversation(@Param('tenantId') tenantId: string, @Param('channelUserId') channelUserId: string) {
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

  private async requireTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return tenant;
  }
}
