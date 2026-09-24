import { PrismaClient } from '@prisma/client';
import { currentTenantId } from '../common/tenant-context';

/**
 * Modelos que carregam tenantId e devem ser sempre filtrados por ele.
 * Deliberadamente NÃO inclui `tenant` (registro do tenant em si, uso administrativo) nem `RefreshToken`
 * (não tem `tenantId`; só é acessado pelo login/refresh, via PrismaService cru).
 */
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'TenantPolicyConfig',
  'AiProviderConfig',
  'AiProviderCredential',
  'PulseIspConnection',
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
  'CancellationRequest',
  'CommercialLead',
  'SatisfactionSurvey',
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

const WRITE_WHERE_OPS = new Set(['update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany']);
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

/** Chaves que o Prisma usa para escrever em relações — não passam pelo filtro de tenant. */
const RELATION_WRITE_KEYS = new Set([
  'create',
  'createMany',
  'connect',
  'connectOrCreate',
  'disconnect',
  'set',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function assertNoNestedRelationWrites(model: string, data: unknown) {
  if (!isPlainObject(data)) return;
  for (const [field, value] of Object.entries(data)) {
    if (!isPlainObject(value)) continue;
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((k) => RELATION_WRITE_KEYS.has(k))) {
      throw new Error(
        `[tenant-isolation] escrita aninhada em "${model}.${field}" não é suportada: faça a escrita da ` +
          'relação em uma operação própria, para o filtro de tenant ser aplicado.',
      );
    }
  }
}

function assertSameTenant(model: string, row: Record<string, unknown> | undefined, tenantId: string) {
  if (row?.tenantId && row.tenantId !== tenantId) {
    throw new Error(`[tenant-isolation] tentativa de gravar "${model}" com tenantId divergente do contexto.`);
  }
}

/**
 * Extensão Prisma que aplica isolamento de tenant na CAMADA DE DADOS: todo acesso a um modelo
 * tenant-scoped exige um `currentTenantId()` (vindo do AsyncLocalStorage por requisição) e o filtro
 * `tenantId` é injetado automaticamente — mesmo que um service esqueça de filtrar. Isso é o que torna
 * P0.8 (isolamento entre tenants) uma garantia estrutural, não uma convenção de código.
 *
 * FAIL-CLOSED: operação que a extensão não sabe escopar (ex.: uma operação nova de uma versão futura do
 * Prisma) é recusada em vez de passar sem filtro.
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
            throw new Error(
              `[tenant-isolation] operação "${operation}" em "${model}" bloqueada: nenhum contexto de tenant ativo.`,
            );
          }

          const a = (args ?? {}) as Record<string, any>;

          if (CREATE_OPS.has(operation)) {
            if (operation !== 'create') a.data = Array.isArray(a.data) ? a.data : isPlainObject(a.data) ? [a.data] : [];
            const rows: Record<string, unknown>[] = operation === 'create' ? [a.data ?? (a.data = {})] : a.data;
            for (const row of rows) {
              assertSameTenant(model, row, tenantId);
              assertNoNestedRelationWrites(model, row);
              row.tenantId = tenantId;
            }
            return query(a);
          }

          if (operation === 'upsert') {
            a.create = a.create ?? {};
            assertSameTenant(model, a.create, tenantId);
            assertSameTenant(model, a.update, tenantId);
            assertNoNestedRelationWrites(model, a.create);
            assertNoNestedRelationWrites(model, a.update);
            a.create.tenantId = tenantId;
            return query(scopeWhere(model, a, tenantId));
          }

          if (WRITE_WHERE_OPS.has(operation) || READ_OPS.has(operation)) {
            if (operation.startsWith('update')) {
              assertSameTenant(model, a.data, tenantId);
              assertNoNestedRelationWrites(model, a.data);
            }
            return query(scopeWhere(model, a, tenantId));
          }

          throw new Error(
            `[tenant-isolation] operação "${operation}" em "${model}" não é suportada pela extensão de tenant ` +
              '(fail-closed): adicione o tratamento explícito antes de usá-la.',
          );
        },
      },
    },
  });
}

function scopeWhere(model: string, a: Record<string, any>, tenantId: string) {
  // Em `TenantPolicyConfig`, o campo de isolamento (`tenantId`) É a própria chave primária. Sem este
  // check, um `where.tenantId` explícito e divergente do contexto seria silenciosamente sobrescrito pelo
  // spread abaixo — a query "funcionaria", mas devolveria os dados do tenant ERRADO. Bloquear
  // explicitamente é mais seguro que mascarar.
  const requestedTenantId = (a.where as Record<string, unknown> | undefined)?.tenantId;
  if (requestedTenantId && requestedTenantId !== tenantId) {
    throw new Error(`[tenant-isolation] operação em "${model}" bloqueada: tenantId divergente do contexto ativo.`);
  }
  a.where = { ...(a.where ?? {}), tenantId };
  return a;
}
