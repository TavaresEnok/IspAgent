import { Inject, Injectable } from '@nestjs/common';
import { ERP_ADAPTER, ERPAdapter } from '../integrations/erp/erp-adapter.interface';
import {
  createBillingTool,
  createPlanViewTool,
  createSupportCreateTicketTool,
  createSupportGetTicketsTool,
} from './erp-tools';

/**
 * Instâncias prontas das ferramentas ligadas ao ERPAdapter ativo (token `ERP_ADAPTER`, seção 6.1) — o
 * Agent Orchestrator (Fase 6) injeta este serviço em vez de construir `ToolDefinition`s na mão.
 */
@Injectable()
export class ErpToolsService {
  readonly billingTool;
  readonly supportGetTicketsTool;
  readonly supportCreateTicketTool;
  readonly planViewTool;

  constructor(@Inject(ERP_ADAPTER) readonly erp: ERPAdapter) {
    this.billingTool = createBillingTool(erp);
    this.supportGetTicketsTool = createSupportGetTicketsTool(erp);
    this.supportCreateTicketTool = createSupportCreateTicketTool(erp);
    this.planViewTool = createPlanViewTool(erp);
  }
}
