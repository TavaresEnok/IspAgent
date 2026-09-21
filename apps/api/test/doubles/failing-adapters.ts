import {
  Contract,
  Customer,
  FinancialStatus,
  Invoice,
  Plan,
  ServiceStatus,
  SupportTicket,
  CustomerNetworkHealth,
} from '@ispagent/shared';
import { ERPAdapter } from '../../src/integrations/erp/erp-adapter.interface';
import { PulseISPAdapter } from '../../src/integrations/pulseisp/pulseisp-adapter.interface';
import { AIProvider, ComposeReplyInput, IntentClassification } from '../../src/integrations/ai/ai-provider.interface';

/**
 * Doubles de teste para o P1 "comportamento correto quando o upstream falha" (ERP, PulseISP, AI
 * Provider) — seção 11. Nenhum destes simula um bug; simulam o mundo real (rede fora, 5xx, timeout de
 * API) que `MockERPAdapter`/`MockAIProvider` nunca exercitam porque sempre funcionam.
 */

const UPSTREAM_ERROR_MESSAGE = 'upstream indisponível (simulado para teste)';

/** Todo método rejeita imediatamente — equivalente a um ERP fora do ar / erro 5xx. */
export class FailingERPAdapter implements ERPAdapter {
  readonly name = 'FailingERPAdapter (teste)';
  readonly mode = 'DEMO' as const;

  findCustomer(): Promise<Customer | null> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getCustomer(): Promise<Customer | null> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getContracts(): Promise<Contract[]> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getPlans(): Promise<Plan[]> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getInvoices(): Promise<Invoice[]> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getFinancialStatus(): Promise<FinancialStatus | null> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getSupportTickets(): Promise<SupportTicket[]> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  createSupportTicket(): Promise<SupportTicket> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
  getServiceStatus(): Promise<ServiceStatus | null> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
}

/** Toda chamada demora mais que o timeout do `ToolExecutorService` — equivalente a um upstream lento. */
export class SlowERPAdapter implements ERPAdapter {
  readonly name = 'SlowERPAdapter (teste)';
  readonly mode = 'DEMO' as const;

  constructor(private readonly delayMs: number) {}

  private async slow<T>(value: T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return value;
  }

  findCustomer(): Promise<Customer | null> {
    return this.slow(null);
  }
  getCustomer(): Promise<Customer | null> {
    return this.slow(null);
  }
  getContracts(): Promise<Contract[]> {
    return this.slow([]);
  }
  getPlans(): Promise<Plan[]> {
    return this.slow([]);
  }
  getInvoices(): Promise<Invoice[]> {
    return this.slow([]);
  }
  getFinancialStatus(): Promise<FinancialStatus | null> {
    return this.slow(null);
  }
  getSupportTickets(): Promise<SupportTicket[]> {
    return this.slow([]);
  }
  createSupportTicket(): Promise<SupportTicket> {
    return Promise.reject(new Error('SlowERPAdapter.createSupportTicket não usado neste teste'));
  }
  getServiceStatus(): Promise<ServiceStatus | null> {
    return this.slow(null);
  }
}

/** Rejeita sempre — equivalente à API do PulseISP fora do ar. */
export class FailingPulseISPAdapter implements PulseISPAdapter {
  readonly name = 'FailingPulseISPAdapter (teste)';

  getCustomerNetworkHealth(): Promise<CustomerNetworkHealth | null> {
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
}

/** `classifyIntent`/`composeReply` rejeitam — equivalente a chave inválida, rate limit ou API fora do ar. */
export class FailingAIProvider implements AIProvider {
  readonly name = 'FailingAIProvider (teste)';
  readonly mode = 'LIVE' as const;
  readonly model = 'failing-test-model';

  constructor(
    private readonly opts: { failClassify?: boolean; failCompose?: boolean } = {
      failClassify: true,
      failCompose: true,
    },
  ) {}

  classifyIntent(): Promise<IntentClassification> {
    if (this.opts.failClassify === false) return Promise.resolve({ intent: 'FINANCEIRO', confidence: 'HIGH' });
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }

  composeReply(_input: ComposeReplyInput): Promise<string> {
    if (this.opts.failCompose === false) return Promise.resolve('resposta de teste');
    return Promise.reject(new Error(UPSTREAM_ERROR_MESSAGE));
  }
}
