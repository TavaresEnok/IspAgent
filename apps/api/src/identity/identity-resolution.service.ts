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

const PHONE_SHAPE = /^\+?[\d\s().-]{8,}$/;

/**
 * Variantes equivalentes de um telefone brasileiro (`+5511999990001`, `5511999990001`, `11999990001`).
 * Valores que não parecem telefone (ex.: `pulse:123`, `webchat_user`) voltam como estão — nunca viram
 * uma busca "aproximada".
 */
export function phoneVariants(input: string): string[] {
  const raw = input.trim();
  if (!PHONE_SHAPE.test(raw)) return [raw];

  const digits = raw.replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  return [...new Set([raw, national, `55${national}`, `+55${national}`])];
}

/** CPF (11) ou CNPJ (14) só com dígitos, ou `null` se não tiver esse formato. */
export function normalizeDocument(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

/** As duas grafias em que o documento costuma estar gravado: só dígitos e formatada. */
export function documentVariants(digits: string): string[] {
  const formatted =
    digits.length === 11
      ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
      : digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return [digits, formatted];
}

/**
 * Seção 5.1: nunca vincula silenciosamente um canal a um contrato incerto. Toda resolução registra
 * método e confiança; ambiguidade e "não encontrado" são resultados de primeira classe, não erros.
 */
@Injectable()
export class IdentityResolutionService {
  constructor(private readonly db: TenantPrismaService) {}

  async resolveByPhone(phone: string): Promise<IdentityResolution> {
    const matches = await this.db.client.customer.findMany({
      where: { phones: { hasSome: phoneVariants(phone) } },
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

    return this.toResolution('PHONE_EXACT', matches[0], 'HIGH');
  }

  /**
   * Desambiguação por CPF/CNPJ dado um telefone já sabido ambíguo (seção 5.1: "minimizar dado sensível
   * pedido" — só é chamado quando o telefone sozinho não resolveu). Telefone E documento precisam bater.
   */
  async resolveByPhoneAndDocument(phone: string, document: string): Promise<IdentityResolution> {
    const digits = normalizeDocument(document);
    if (!digits) return { method: 'NOT_FOUND', confidence: 'LOW' };

    const matches = await this.db.client.customer.findMany({
      where: { phones: { hasSome: phoneVariants(phone) }, document: { in: documentVariants(digits) } },
      include: { contracts: { where: { status: 'ACTIVE' } } },
      take: 2,
    });

    if (matches.length === 0) return { method: 'NOT_FOUND', confidence: 'LOW' };
    if (matches.length > 1) {
      return { method: 'AMBIGUOUS', confidence: 'LOW', candidates: matches.map((c) => ({ customerId: c.id, name: c.name })) };
    }
    return this.toResolution('DOCUMENT', matches[0], 'HIGH');
  }

  /**
   * Identificação só pelo documento digitado (o telefone do canal não está cadastrado). O documento é um
   * segredo fraco (CPF vaza com facilidade), então: match EXATO e ÚNICO, e a confiança nunca passa de
   * MEDIUM. Nunca por nome, código ou trecho de texto.
   */
  async resolveByDocument(document: string): Promise<IdentityResolution> {
    const digits = normalizeDocument(document);
    if (!digits) return { method: 'NOT_FOUND', confidence: 'LOW' };

    const matches = await this.db.client.customer.findMany({
      where: { document: { in: documentVariants(digits) } },
      include: { contracts: { where: { status: 'ACTIVE' } } },
      take: 2,
    });

    if (matches.length === 0) return { method: 'NOT_FOUND', confidence: 'LOW' };
    if (matches.length > 1) {
      return { method: 'AMBIGUOUS', confidence: 'LOW', candidates: matches.map((c) => ({ customerId: c.id, name: c.name })) };
    }
    return this.toResolution('DOCUMENT', matches[0], 'MEDIUM');
  }

  /**
   * Simulador do painel: um ADMIN escolheu o cliente (canal reservado `sgp:<id>`, validado no Web Chat).
   * Vincula direto pelo id do cliente, com a mesma regra de contrato ativo único.
   */
  async resolveByCustomerId(customerId: string): Promise<IdentityResolution> {
    const customer = await this.db.client.customer.findUnique({
      where: { id: customerId },
      include: { contracts: { where: { status: 'ACTIVE' } } },
    });
    if (!customer) return { method: 'NOT_FOUND', confidence: 'LOW' };
    return this.toResolution('PHONE_EXACT', customer, 'HIGH');
  }

  private toResolution(
    method: 'PHONE_EXACT' | 'DOCUMENT',
    customer: { id: string; contracts: Array<{ id: string }> },
    best: Confidence,
  ): IdentityResolution {
    const contracts = customer.contracts;
    if (contracts.length === 1) {
      return { method, confidence: best, customerId: customer.id, contractId: contracts[0].id };
    }
    // Cliente identificado, mas sem um único contrato ativo óbvio (zero ou vários) — confiança menor,
    // contrato fica para uma etapa de desambiguação separada (fora do escopo desta fase).
    return { method, confidence: 'MEDIUM', customerId: customer.id, contractId: null };
  }
}
