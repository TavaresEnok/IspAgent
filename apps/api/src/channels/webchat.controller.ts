import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Sse } from '@nestjs/common';
import { EMPTY, Observable } from 'rxjs';
import { RealtimeEventsService } from '../events/events.service';
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

import { ERP_ADAPTER, ERPAdapter } from '../integrations/erp/erp-adapter.interface';
import { Inject } from '@nestjs/common';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { ReceiptAnalysisResult } from '../integrations/ai/ai-provider.interface';

const UNREADABLE_AUDIO_MESSAGE = 'Não consegui entender o seu áudio. Pode escrever a sua mensagem, por favor?';
const UNREADABLE_RECEIPT_MESSAGE =
  'Não consegui ler esse arquivo como comprovante. Pode enviar uma foto mais nítida, ou escrever o valor e a data do pagamento?';

class WebchatMessageDto {
  @IsString()
  @MinLength(1)
  channelUserId!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}

/**
 * Web Chat oficial para o cliente final. Público (sem JWT).
 * Conecta-se diretamente ao SGP da Vibe Telecom para identificação real.
 */
@Controller('public/webchat')
export class WebchatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly orchestrator: AgentOrchestratorService,
    @Inject(ERP_ADAPTER) private readonly erp: ERPAdapter,
    private readonly pulse: PulseIspClient,
    private readonly mirror: PulseIspMirrorService,
    private readonly aiResolver: AiProviderResolverService,
    private readonly events: RealtimeEventsService,
  ) {}

  /**
   * Busca cliente real no SGP por CPF/CNPJ, telefone ou contrato.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':tenantId/sgp-customer')
  async sgpCustomer(@Param('tenantId') tenantId: string, @Query('query') query = '') {
    await this.requireTenant(tenantId);
    const q = query.trim();
    if (q.length < 2) throw new BadRequestException('Digite pelo menos 2 caracteres.');

    return runWithTenant(tenantId, async () => {
      const cleanDigits = q.replace(/\D/g, '');
      const isDoc = cleanDigits.length === 11 || cleanDigits.length === 14;
      const isPhone = !isDoc && cleanDigits.length >= 10 && cleanDigits.length <= 11;

      const customer = await this.erp.findCustomer({
        document: isDoc ? cleanDigits : undefined,
        phone: isPhone ? cleanDigits : undefined,
        contractId: !isDoc && !isPhone ? q : undefined,
      });

      if (!customer) {
        return { found: false };
      }

      const contracts = await this.erp.getContracts(customer.id);
      return {
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          document: customer.document,
          phones: customer.phones,
          contracts: contracts.map((c) => ({
            id: c.id,
            planName: c.planName,
            status: c.status,
            address: c.address,
          })),
        },
      };
    });
  }

  /**
   * Inicia sessão no webchat como cliente específico do SGP.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':tenantId/sgp-simulate')
  async sgpSimulate(@Param('tenantId') tenantId: string, @Body() body: { customerId?: string; phone?: string; contractId?: string }) {
    await this.requireTenant(tenantId);
    return runWithTenant(tenantId, async () => {
      const custId = body.customerId || body.phone || body.contractId;
      if (!custId) throw new BadRequestException('Informe customerId, phone ou contractId.');

      const customer =
        (await this.erp.findCustomer({
          contractId: body.contractId,
          phone: body.phone,
        })) || (await this.erp.getCustomer(custId));

      if (!customer) throw new NotFoundException('Cliente não localizado no SGP.');

      const channelUserId = customer.phones[0] || `sgp:${customer.id}`;
      return {
        channelUserId,
        customerName: customer.name,
        customerId: customer.id,
      };
    });
  }

  // Web Chat de teste: escolher o provedor (ex.: Vibe), buscar um cliente do PulseISP dele e conversar
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

  // Mensagens novas da conversa em tempo real (ex.: resposta do atendente humano), sem polling.
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Sse(':tenantId/conversation/:channelUserId/stream')
  async streamConversation(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
  ): Promise<Observable<{ data: unknown }>> {
    await this.requireTenant(tenantId);
    const conv = await runWithTenant(tenantId, () =>
      this.db.client.conversation.findFirst({
        where: { channel: 'WEBCHAT', channelUserId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
    );
    return conv ? this.events.streamForConversation(tenantId, conv.id) : EMPTY;
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
        await this.db.client.satisfactionSurvey.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.cancellationRequest.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.message.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.conversation.delete({ where: { id: conv.id } });
      }

      return { reset: true, conversationsRemoved: existing.length };
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':tenantId/survey')
  async submitSurvey(
    @Param('tenantId') tenantId: string,
    @Body() body: { conversationId: string; rating: number; comment?: string; tags?: string[] },
  ) {
    await this.requireTenant(tenantId);
    if (!body?.conversationId || typeof body?.rating !== 'number') {
      throw new BadRequestException('conversationId e rating são obrigatórios.');
    }
    const rating = Math.max(1, Math.min(5, Math.round(body.rating)));

    return runWithTenant(tenantId, async () => {
      const conv = await this.db.client.conversation.findUnique({
        where: { id: body.conversationId },
      });
      if (!conv) throw new NotFoundException('Conversa não encontrada.');

      const survey = await this.db.client.satisfactionSurvey.create({
        data: {
          tenantId,
          conversationId: conv.id,
          score: rating,
          feedback: body.comment?.trim() || null,
        },
      });

      if (conv.status !== 'CLOSED') {
        await this.db.client.conversation.update({
          where: { id: conv.id },
          data: { status: 'CLOSED' },
        });
      }

      return { success: true, surveyId: survey.id };
    });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':tenantId/incident-check/:channelUserId')
  async checkIncident(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
  ) {
    await this.requireTenant(tenantId);
    return runWithTenant(tenantId, async () => {
      const conv = await this.db.client.conversation.findFirst({
        where: { channel: 'WEBCHAT', channelUserId },
        include: { customer: { include: { contracts: true } } },
      });

      if (!conv?.customer?.contracts?.length) {
        return { hasIncident: false };
      }

      const contract = conv.customer.contracts.find((c: any) => c.status === 'ACTIVE') || conv.customer.contracts[0];
      const status = await this.erp.getServiceStatus(contract.id);

      if (status && !status.online) {
        return {
          hasIncident: true,
          severity: 'warning',
          title: 'Aviso de Manutenção / Sinal Indisponível',
          message: 'Detectamos que a sua conexão PON/fibra está sem sinal no momento. Nossos técnicos já estão cientes e atuando na normalização.',
        };
      }

      return { hasIncident: false };
    });
  }

  /**
   * Upload e processamento OCR multimodal de comprovante de pagamento via WebChat.
   */
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post(':tenantId/upload-receipt')
  async uploadReceipt(
    @Param('tenantId') tenantId: string,
    @Body() body: { channelUserId: string; fileBase64: string; mimeType?: string; filename?: string },
  ) {
    await this.requireTenant(tenantId);
    if (!body?.channelUserId || !body?.fileBase64) {
      throw new BadRequestException('channelUserId e fileBase64 são obrigatórios.');
    }

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WEBCHAT', body.channelUserId);
      const ai = await this.aiResolver.resolve(tenantId);

      let receiptAnalysis: ReceiptAnalysisResult | null = null;
      if (typeof ai.analyzeReceipt === 'function') {
        try {
          receiptAnalysis = await ai.analyzeReceipt(body.fileBase64, body.mimeType || 'image/jpeg');
        } catch {
          receiptAnalysis = null;
        }
      }

      // Sem leitura confiável do comprovante, nada é repassado ao agente como se o cliente tivesse dito.
      if (!receiptAnalysis?.isValid) {
        await this.conversation.appendMessage(conv.id, 'CUSTOMER', '[Arquivo anexado pelo cliente]');
        await this.conversation.appendMessage(conv.id, 'AGENT', UNREADABLE_RECEIPT_MESSAGE);
        return this.snapshot(conv.id, { receiptAnalysis, decision: null });
      }

      const amount = Number(receiptAnalysis.amount);
      const amountStr = Number.isFinite(amount) && amount > 0 ? `R$ ${amount.toFixed(2)}` : 'valor não identificado';
      const dateStr = receiptAnalysis.date || 'data não identificada';
      const authStr = receiptAnalysis.authCode ? ` (Aut: ${receiptAnalysis.authCode})` : '';
      const textContent = `[Comprovante enviado pelo cliente - ${amountStr}, Data: ${dateStr}${authStr}]. Já efetuei o pagamento, segue comprovante para validação e desbloqueio da minha conexão.`;

      const decision = await this.orchestrator.handleMessage(conv.id, textContent);
      const [messages, refreshed] = await Promise.all([
        this.db.client.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
        this.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      ]);

      return {
        conversationId: conv.id,
        receiptAnalysis,
        decision,
        messages,
        status: refreshed.status,
      };
    });
  }

  /**
   * Processamento e transcrição de áudio/voz via WebChat.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':tenantId/voice')
  async sendVoiceNote(
    @Param('tenantId') tenantId: string,
    @Body() body: { channelUserId: string; audioBase64: string; mimeType?: string },
  ) {
    await this.requireTenant(tenantId);
    if (!body?.channelUserId || !body?.audioBase64) {
      throw new BadRequestException('channelUserId e audioBase64 são obrigatórios.');
    }

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WEBCHAT', body.channelUserId);
      const ai = await this.aiResolver.resolve(tenantId);

      let transcription = '';
      if (typeof ai.transcribeAudio === 'function') {
        try {
          transcription = (await ai.transcribeAudio(body.audioBase64, body.mimeType || 'audio/webm')).trim();
        } catch {
          transcription = '';
        }
      }

      // Sem transcrição, o agente não pode agir sobre algo que o cliente não disse.
      if (!transcription) {
        await this.conversation.appendMessage(conv.id, 'CUSTOMER', '[Áudio enviado pelo cliente]');
        await this.conversation.appendMessage(conv.id, 'AGENT', UNREADABLE_AUDIO_MESSAGE);
        return this.snapshot(conv.id, { transcription, decision: null });
      }

      const messageText = `[Áudio enviado pelo cliente]: "${transcription}"`;
      const decision = await this.orchestrator.handleMessage(conv.id, messageText);
      const [messages, refreshed] = await Promise.all([
        this.db.client.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
        this.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      ]);

      return {
        conversationId: conv.id,
        transcription,
        decision,
        messages,
        status: refreshed.status,
      };
    });
  }

  private async snapshot<T extends object>(conversationId: string, extra: T) {
    const [messages, refreshed] = await Promise.all([
      this.db.client.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } }),
      this.db.client.conversation.findUniqueOrThrow({ where: { id: conversationId } }),
    ]);
    return { conversationId, ...extra, messages, status: refreshed.status };
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
