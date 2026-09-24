import { Injectable } from '@nestjs/common';
import { Conversation, ConversationChannel, MessageRole } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IdentityResolutionService, IdentityResolution } from '../identity/identity-resolution.service';
import { currentTenantId } from '../common/tenant-context';
import { trustWebchatPhone } from '../common/security-config';

/**
 * `tenantId` é passado explicitamente aqui (via `currentTenantId()`) para satisfazer o tipo gerado
 * pelo Prisma, que exige o campo no `data` de `create`. A extensão de tenant-scoping
 * (tenant-scoped.extension.ts) também o injeta em runtime como camada extra de segurança — isso é
 * defesa em profundidade, não redundância inútil: mesmo que um `create` futuro esqueça de passar
 * `tenantId`, a extensão ainda bloqueia o vazamento.
 */
function requireTenantId(): string {
  const tenantId = currentTenantId();
  if (!tenantId) {
    throw new Error('[tenant-isolation] operação requer contexto de tenant ativo.');
  }
  return tenantId;
}

/**
 * Conversation Engine (seção 5.2). Mantém, por conversa: cliente/contrato resolvidos, e evita
 * reexecutar a resolução de identidade a cada mensagem — assim como o agente não deve reabrir chamado
 * duplicado nem reperguntar o que já sabe.
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly identity: IdentityResolutionService,
  ) {}

  /**
   * Serializa "buscar ou criar" por (tenant, canal, usuário) com um advisory lock de transação: duas
   * mensagens simultâneas do mesmo cliente não criam duas conversas abertas.
   */
  async findOrCreateConversation(channel: ConversationChannel, channelUserId: string): Promise<Conversation> {
    const tenantId = requireTenantId();
    return this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}|${channel}|${channelUserId}`}))`;

      const existing = await tx.conversation.findFirst({
        where: { channel, channelUserId, status: { not: 'CLOSED' } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;

      return tx.conversation.create({
        data: { tenantId, channel, channelUserId, status: 'AI_ACTIVE' },
      });
    });
  }

  /**
   * Idempotente: se a conversa já tem identidade resolvida (inclusive AMBIGUOUS/NOT_FOUND registrados
   * via identityMethod), retorna o estado já persistido em vez de rodar a resolução de novo.
   */
  async resolveIdentity(conversationId: string): Promise<IdentityResolution> {
    const conversation = await this.db.client.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    if (conversation.identityMethod) {
      return this.toIdentityResolution(conversation);
    }

    // `sgp:<id>` só chega aqui vindo do simulador (o Web Chat exige login de admin para esse prefixo).
    const simulatedCustomerId =
      conversation.channel === 'WEBCHAT' && conversation.channelUserId.startsWith('sgp:')
        ? conversation.channelUserId.slice('sgp:'.length)
        : null;
    const result = simulatedCustomerId
      ? await this.identity.resolveByCustomerId(simulatedCustomerId)
      : this.canTrustChannelPhone(conversation)
        ? await this.identity.resolveByPhone(conversation.channelUserId)
        : ({ method: 'NOT_FOUND', confidence: 'LOW' } as const);

    await this.db.client.conversation.update({
      where: { id: conversationId },
      data: {
        identityMethod: result.method,
        identityConfidence: result.confidence,
        customerId: result.method === 'PHONE_EXACT' || result.method === 'DOCUMENT' ? result.customerId : null,
        contractId: result.method === 'PHONE_EXACT' || result.method === 'DOCUMENT' ? result.contractId : null,
      },
    });

    return result;
  }

  async appendMessage(conversationId: string, role: MessageRole, content: string) {
    return this.db.client.message.create({
      data: { tenantId: requireTenantId(), conversationId, role, content },
    });
  }

  /**
   * No Web Chat o "telefone" é só texto digitado — não prova quem é. Fora do modo DEMO ele não identifica
   * ninguém (só o documento informado no chat, ou o simulador de staff `pulse:*`). Canais verificados
   * (WhatsApp) provam o número.
   */
  private canTrustChannelPhone(conversation: Conversation): boolean {
    if (conversation.channel !== 'WEBCHAT') return true;
    return trustWebchatPhone() || conversation.channelUserId.startsWith('pulse:');
  }

  private toIdentityResolution(conversation: Conversation): IdentityResolution {
    switch (conversation.identityMethod) {
      case 'PHONE_EXACT':
      case 'DOCUMENT':
        return {
          method: conversation.identityMethod,
          confidence: (conversation.identityConfidence as 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM',
          customerId: conversation.customerId as string,
          contractId: conversation.contractId,
        };
      case 'AMBIGUOUS':
        // Candidatos não são persistidos na conversa (evita duplicar dado do Customer); quem precisar
        // da lista completa de novo chama identity.resolveByPhone diretamente.
        return { method: 'AMBIGUOUS', confidence: 'LOW', candidates: [] };
      default:
        return { method: 'NOT_FOUND', confidence: 'LOW' };
    }
  }
}
