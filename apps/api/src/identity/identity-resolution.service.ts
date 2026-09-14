import { Injectable } from '@nestjs/common';
import { IdentityMethod } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IdentityCandidate {
  customerId: string;
  name: string;
}

export type IdentityResolution =
  | {
      method: Extract<IdentityMethod, 'PHONE_EXACT' | 'DOCUMENT'>;
      confidence: Confidence;
      customerId: string;
      contractId: string | null;
    }
  | { method: 'AMBIGUOUS'; confidence: 'LOW'; candidates: IdentityCandidate[] }
  | { method: 'NOT_FOUND'; confidence: 'LOW' };

/**
 * Seção 5.1: nunca vincula silenciosamente um canal a um contrato incerto. Toda resolução registra
 * método e confiança; ambiguidade e "não encontrado" são resultados de primeira classe, não erros.
 */
@Injectable()
export class IdentityResolutionService {
  constructor(private readonly db: TenantPrismaService) {}

  async resolveByPhone(phone: string): Promise<IdentityResolution> {
    const matches = await this.db.client.customer.findMany({
      where: { phones: { has: phone } },
      include: { contracts: { where: { status: 'ACTIVE' } } },
    });

    if (matches.length === 0) {
      return { method: 'NOT_FOUND', confidence: 'LOW' };
    }

    if (matches.length > 1) {
      return {
        method: 'AMBIGUOUS',
        confidence: 'LOW',
        candidates: matches.map((c) => ({ customerId: c.id, name: c.name })),
      };
    }

    const customer = matches[0];
    return this.toResolution('PHONE_EXACT', customer);
  }

  /**
   * Desambiguação por CPF/CNPJ dado um telefone já sabido ambíguo (seção 5.1: "minimizar dado sensível
   * pedido" — só é chamado quando o telefone sozinho não resolveu).
   */
  async resolveByPhoneAndDocument(phone: string, document: string): Promise<IdentityResolution> {
    const matches = await this.db.client.customer.findMany({
      where: { phones: { has: phone }, document },
      include: { contracts: { where: { status: 'ACTIVE' } } },
    });

    if (matches.length === 0) {
      return { method: 'NOT_FOUND', confidence: 'LOW' };
    }

    return this.toResolution('DOCUMENT', matches[0]);
  }

  private toResolution(
    method: 'PHONE_EXACT' | 'DOCUMENT',
    customer: { id: string; contracts: Array<{ id: string }> },
  ): IdentityResolution {
    const contracts = customer.contracts;
    if (contracts.length === 1) {
      return { method, confidence: 'HIGH', customerId: customer.id, contractId: contracts[0].id };
    }
    // Cliente identificado, mas sem um único contrato ativo óbvio (zero ou vários) — confiança menor,
    // contrato fica para uma etapa de desambiguação separada (fora do escopo desta fase).
    return { method, confidence: 'MEDIUM', customerId: customer.id, contractId: null };
  }
}
