import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RunMode, ToolResult } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';
import { PolicyEngineService } from '../policy/policy-engine.service';
import { ToolDefinition, ToolRunOptions } from './tool.types';

/** Só o subconjunto de `ToolDefinition` que os helpers privados (`finish`/`toToolResult`) precisam —
 * evita o problema de variância de `TInput` ao repassar `def` de um método genérico para outro. */
type ToolDescriptor = { name: string; adapter: string; mode: RunMode; capability: string };

/**
 * Pipeline obrigatório da seção 4, sem etapa pulável:
 * Tool Request → Schema Validation → Tenant Validation → Policy Engine → Permission Check →
 * Confirmation Check → Execução → ToolResult → Audit Log → Agent.
 *
 * "Tenant Validation" é implícito: `currentTenantId()` (AsyncLocalStorage) lança se não houver
 * contexto ativo, e toda persistência passa pela extensão de tenant-scoping do Prisma — não existe
 * caminho para uma ToolCall ser gravada sem tenantId correto.
 */
@Injectable()
export class ToolExecutorService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly policy: PolicyEngineService,
  ) {}

  async run<TInput, TOutput>(
    def: ToolDefinition<TInput, TOutput>,
    rawInput: unknown,
    opts: ToolRunOptions,
  ): Promise<ToolResult<TOutput>> {
    const tenantId = currentTenantId();
    if (!tenantId) {
      throw new Error('[tool-executor] execução de ferramenta requer contexto de tenant ativo.');
    }

    // Idempotência (seção 1.7): retry com a mesma chave nunca duplica efeito — nem reexecuta, nem
    // reavalia policy de novo. Devolve exatamente o resultado já persistido da primeira execução.
    if (opts.idempotencyKey) {
      const existing = await this.db.client.toolCall.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: opts.idempotencyKey } },
      });
      if (existing) {
        return this.toToolResult(def, existing);
      }
    }

    const toolCallId = randomUUID();
    const startedAt = Date.now();

    const parsed = def.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return this.finish(def, opts, toolCallId, startedAt, {
        status: 'INVALID_INPUT',
        error: { code: 'INVALID_INPUT', message: parsed.error.message },
        facts: [],
      });
    }

    const decision = await this.policy.evaluate(def.action, { confirmed: opts.confirmed });

    if (!decision.allowed) {
      return this.finish(def, opts, toolCallId, startedAt, {
        status: 'BLOCKED_BY_POLICY',
        error: { code: 'BLOCKED_BY_POLICY', message: decision.reason },
        facts: [],
      });
    }

    if (decision.requiresConfirmation) {
      return this.finish(def, opts, toolCallId, startedAt, {
        status: 'NEEDS_CONFIRMATION',
        error: { code: 'NEEDS_CONFIRMATION', message: decision.reason },
        facts: [],
      });
    }

    try {
      const outcome = await this.withTimeout(
        def.execute(parsed.data, { tenantId, idempotencyKey: opts.idempotencyKey }),
        opts.timeoutMs ?? 10_000,
      );
      return this.finish(def, opts, toolCallId, startedAt, outcome);
    } catch (err) {
      const timedOut = err instanceof Error && err.message === 'TOOL_TIMEOUT';
      return this.finish(def, opts, toolCallId, startedAt, {
        status: timedOut ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        error: { code: timedOut ? 'TIMEOUT' : 'UPSTREAM_ERROR', message: err instanceof Error ? err.message : String(err) },
        facts: [],
      });
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TOOL_TIMEOUT')), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async finish<TOutput>(
    def: ToolDescriptor,
    opts: ToolRunOptions,
    toolCallId: string,
    startedAt: number,
    outcome: {
      status: ToolResult['status'];
      data?: TOutput;
      facts: ToolResult['facts'];
      error?: { code: string; message: string };
    },
  ): Promise<ToolResult<TOutput>> {
    const latencyMs = Date.now() - startedAt;
    const tenantId = currentTenantId() as string;

    const result: ToolResult<TOutput> = {
      toolCallId,
      tool: def.name,
      status: outcome.status,
      source: { adapter: def.adapter, mode: def.mode, latencyMs, capability: def.capability },
      data: outcome.data,
      facts: outcome.facts,
      error: outcome.error,
      idempotencyKey: opts.idempotencyKey,
    };

    await this.db.client.toolCall.create({
      data: {
        id: toolCallId,
        tenantId,
        agentRunId: opts.agentRunId,
        tool: def.name,
        args: {},
        status: result.status,
        source: result.source,
        data: (result.data ?? undefined) as object | undefined,
        facts: result.facts,
        error: result.error ?? undefined,
        idempotencyKey: opts.idempotencyKey,
      },
    });

    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'AGENT',
        action: `tool.${def.name}`,
        entityType: 'ToolCall',
        entityId: toolCallId,
        metadata: { status: result.status, agentRunId: opts.agentRunId },
      },
    });

    return result;
  }

  private toToolResult<TOutput>(
    def: ToolDescriptor,
    stored: {
      id: string;
      status: string;
      source: unknown;
      data: unknown;
      facts: unknown;
      error: unknown;
      idempotencyKey: string | null;
    },
  ): ToolResult<TOutput> {
    return {
      toolCallId: stored.id,
      tool: def.name,
      status: stored.status as ToolResult['status'],
      source: stored.source as ToolResult['source'],
      data: (stored.data ?? undefined) as TOutput | undefined,
      facts: stored.facts as ToolResult['facts'],
      error: (stored.error ?? undefined) as ToolResult['error'],
      idempotencyKey: stored.idempotencyKey ?? undefined,
    };
  }
}
