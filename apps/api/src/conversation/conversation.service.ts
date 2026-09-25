import { Injectable, Optional } from '@nestjs/common';
import { Conversation, ConversationChannel, MessageRole } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IdentityResolutionService, IdentityResolution } from '../identity/identity-resolution.service';
import { currentTenantId } from '../common/tenant-context';
import { RealtimeEventsService } from '../events/events.service';

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
    @Optional() private readonly events?: RealtimeEventsService,
  ) {}

  async findOrCreateConversation(channel: ConversationChannel, channelUserId: string): Promise<Conversation> {
    const existing = await this.db.client.conversation.findFirst({
      where: { channel, channelUserId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    return this.db.client.conversation.create({
      data: { tenantId: requireTenantId(), channel, channelUserId, status: 'AI_ACTIVE' },
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

    const result = await this.identity.resolveByPhone(conversation.channelUserId);

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
    const tenantId = requireTenantId();
    const message = await this.db.client.message.create({
      data: { tenantId, conversationId, role, content },
    });
    this.events?.emit({ tenantId, type: 'NEW_MESSAGE', data: { conversationId, message } });
    return message;
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
