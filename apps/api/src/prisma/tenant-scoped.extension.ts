import { PrismaClient } from '@prisma/client';
import { currentTenantId } from '../common/tenant-context';

/**
 * Modelos que carregam tenantId e devem ser sempre filtrados por ele.
 * Deliberadamente NÃO inclui `tenant` (registro do tenant em si, uso administrativo).
 */
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'TenantPolicyConfig',
  'Customer',
  'Plan',
  'Contract',
  'Invoice',
  'SupportTicket',
  'KnowledgeDocument',
  'AuditLog',
  'Conversation',
  'Message',
  'AgentRun',
  'ToolCall',
  'Handoff',
]);

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_WHERE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

/**
 * Única exceção deliberada: leitura de `User` sem contexto de tenant, necessária para o login
 * (a API ainda não sabe a qual tenant o usuário pertence antes de validar e-mail/senha). O tenantId
 * do usuário encontrado é então usado para emitir o JWT, que passa a carregar o contexto real.
 */
function isLoginBootstrapException(model: string, operation: string): boolean {
  return model === 'User' && (operation === 'findFirst' || operation === 'findUnique');
}

/**
 * Extensão Prisma que aplica isolamento de tenant na CAMADA DE DADOS: todo acesso a um modelo
 * tenant-scoped exige um `currentTenantId()` (vindo do AsyncLocalStorage por requisição) e o filtro
 * `tenantId` é injetado automaticamente — mesmo que um service esqueça de filtrar. Isso é o que torna
 * P0.8 (isolamento entre tenants) uma garantia estrutural, não uma convenção de código.
 */
export function tenantScopedExtension(prismaClient: PrismaClient) {
  return prismaClient.$extends({
    name: 'tenant-scoped',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const tenantId = currentTenantId();

          if (!tenantId) {
            if (isLoginBootstrapException(model, operation)) {
              return query(args);
            }
            throw new Error(
              `[tenant-isolation] operação "${operation}" em "${model}" bloqueada: nenhum contexto de tenant ativo.`,
            );
          }

          const a = (args ?? {}) as Record<string, any>;

          if (operation === 'create') {
            a.data = a.data ?? {};
            if (a.data.tenantId && a.data.tenantId !== tenantId) {
              throw new Error(
                `[tenant-isolation] tentativa de criar "${model}" com tenantId divergente do contexto.`,
              );
            }
            a.data.tenantId = tenantId;
            return query(a);
          }

          if (operation === 'createMany') {
            a.data = Array.isArray(a.data) ? a.data : [];
            for (const row of a.data) {
              if (row.tenantId && row.tenantId !== tenantId) {
                throw new Error(
                  `[tenant-isolation] tentativa de criar "${model}" com tenantId divergente do contexto.`,
                );
              }
              row.tenantId = tenantId;
            }
            return query(a);
          }

          if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
            // Em `TenantPolicyConfig`, o campo de isolamento (`tenantId`) É a própria chave primária.
            // Sem este check, um `where.tenantId` explícito e divergente do contexto seria
            // silenciosamente sobrescrito pelo spread abaixo — a query "funcionaria", mas devolveria os
            // dados do tenant ERRADO (o do contexto, não o solicitado) em vez de simplesmente não achar
            // nada. Bloquear explicitamente é mais seguro que mascarar.
            const requestedTenantId = (a.where as Record<string, unknown> | undefined)?.tenantId;
            if (requestedTenantId && requestedTenantId !== tenantId) {
              throw new Error(
                `[tenant-isolation] operação "${operation}" em "${model}" bloqueada: tenantId divergente do contexto ativo.`,
              );
            }
            a.where = { ...(a.where ?? {}), tenantId };
            return query(a);
          }

          return query(a);
        },
      },
    },
  });
}
