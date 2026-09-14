import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
}

/**
 * Contexto de tenant por requisição, propagado via AsyncLocalStorage — não via argumento manual.
 * Usado pela extensão do Prisma (tenant-scoped.extension.ts) para aplicar o filtro de tenant na
 * camada de dados, independente do controller/service lembrar de filtrar. Isso é o que cobre P0.8:
 * isolamento aplicado na camada de dados, não só no controller.
 */
export const tenantAls = new AsyncLocalStorage<TenantContext>();

export function currentTenantId(): string | undefined {
  return tenantAls.getStore()?.tenantId;
}

/**
 * IMPORTANTE: `fn` é sempre aguardado (`await`) DENTRO do callback passado a `AsyncLocalStorage.run`.
 * O Prisma Client (com extensão) retorna um "thenable" preguiçoso: `prisma.model.findX(...)` não
 * dispara a query de fato até `.then()`/`await` ser chamado. Se apenas retornássemos `fn()` sem
 * `await` aqui dentro, o `.then()` só aconteceria no `await runWithTenant(...)` do chamador — que já
 * roda FORA do `run()`, com o contexto do AsyncLocalStorage já restaurado/perdido — e a extensão de
 * tenant-scoping veria "nenhum contexto ativo" mesmo com um tenant válido informado.
 */
export async function runWithTenant<T>(tenantId: string, fn: () => T | Promise<T>): Promise<T> {
  return tenantAls.run({ tenantId }, async () => {
    return await fn();
  });
}
