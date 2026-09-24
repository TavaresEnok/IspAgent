import { BadRequestException, Injectable } from '@nestjs/common';
import { ContractStatus } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { toPulseId } from './pulseisp-ids';
import { PulseCustomer360 } from './pulseisp-mapper';

export interface SimulatedCustomer {
  channelUserId: string;
  customerName: string;
  contractId: string;
}

const CONTRACT_STATUS: Record<string, ContractStatus> = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
};

/**
 * Simulador ("fingir ser um cliente" do PulseISP): cria/atualiza, no tenant, o Customer/Contract/Plan
 * ESPELHO do cliente real escolhido, para que o fluxo normal do agente (identidade por canal → contrato →
 * ferramentas) funcione igual ao de um cliente que chegou pelo WhatsApp. Copia só o que o agente precisa
 * (nome, plano, status) — NÃO copia endereço, documento nem e-mail. Fatura/chamado NÃO são espelhados
 * (o PulseISP não os fornece nesse formato) e o orquestrador não os responde para contratos `pulse_*`.
 */
@Injectable()
export class PulseIspMirrorService {
  constructor(private readonly db: TenantPrismaService) {}

  async upsertFromCustomer360(tenantId: string, c360: PulseCustomer360, opts?: { document?: string }): Promise<SimulatedCustomer> {
    const customer = c360.customer;
    const contract = c360.contract;
    if (!customer?.id) throw new BadRequestException('Resposta do PulseISP sem cliente.');
    if (!contract) throw new BadRequestException('Este cliente não tem contrato no PulseISP.');
    if (!contract.plan?.id || !contract.plan.name) throw new BadRequestException('O contrato deste cliente não tem plano no PulseISP.');
    const status = CONTRACT_STATUS[contract.status ?? ''];
    if (!status) throw new BadRequestException(`Status de contrato desconhecido no PulseISP: ${contract.status}`);

    const customerId = toPulseId(customer.id);
    const contractId = toPulseId(customer.id);
    const planId = `pulse_plan_${contract.plan.id}`;
    const channelUserId = `pulse:${customer.id}`;
    const name = customer.name ?? 'Cliente PulseISP';
    const document = opts?.document ?? '(não copiado do PulseISP)';

    await this.db.client.plan.upsert({
      where: { id: planId },
      create: {
        id: planId,
        tenantId,
        name: contract.plan.name,
        downloadMbps: contract.plan.downloadMbps ?? 0,
        uploadMbps: contract.plan.uploadMbps ?? 0,
        priceCents: contract.plan.priceCents ?? 0,
      },
      update: {
        name: contract.plan.name,
        downloadMbps: contract.plan.downloadMbps ?? 0,
        uploadMbps: contract.plan.uploadMbps ?? 0,
        priceCents: contract.plan.priceCents ?? 0,
      },
    });

    await this.db.client.customer.upsert({
      where: { id: customerId },
      create: {
        id: customerId,
        tenantId,
        name,
        document,
        phones: [channelUserId],
        externalId: customer.externalId ?? customer.id,
      },
      update: { name, document, phones: [channelUserId], externalId: customer.externalId ?? customer.id },
    });

    await this.db.client.contract.upsert({
      where: { id: contractId },
      create: {
        id: contractId,
        tenantId,
        customerId,
        planId,
        status,
        address: '(não copiado do PulseISP)',
      },
      update: { planId, status },
    });

    return { channelUserId, customerName: name, contractId };
  }
}
