import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { maskDocument } from '../../common/mask-document';
import { ERP_ADAPTER, ERPAdapter } from './erp-adapter.interface';

class SimulateDto {
  @IsString() @MinLength(1) @MaxLength(80) customerId!: string;
}

/** Prefixo reservado do Web Chat para "falar como" um cliente do ERP escolhido por um admin. */
export const SGP_SIMULATOR_PREFIX = 'sgp:';

/**
 * Consulta de clientes do ERP ativo (SGP) para o painel: busca por CPF/CNPJ, telefone ou contrato e o
 * simulador do Web Chat. Dado pessoal real — por isso é rota de STAFF (JWT + papel), nunca pública:
 * pública, qualquer pessoa enumeraria nome/CPF/endereço da base e depois conversaria como o cliente.
 */
@Controller('sgp')
export class SgpController {
  constructor(@Inject(ERP_ADAPTER) private readonly erp: ERPAdapter) {}

  @Get('customer')
  @Roles('AGENT')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async customer(@Query('query') query = '', @Req() req: Request) {
    const q = query.trim().slice(0, 40);
    if (q.length < 2) throw new BadRequestException('Digite pelo menos 2 caracteres.');

    const digits = q.replace(/\D/g, '');
    const isDoc = digits.length === 11 || digits.length === 14;
    const isPhone = !isDoc && digits.length >= 10 && digits.length <= 13;

    const customer = await this.erp.findCustomer({
      document: isDoc ? digits : undefined,
      phone: isPhone ? digits : undefined,
      contractId: !isDoc && !isPhone ? q : undefined,
    });
    if (!customer) return { found: false };

    const contracts = await this.erp.getContracts(customer.id);
    return {
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        document: maskDocument(customer.document, req.user?.role),
        phones: customer.phones,
        contracts: contracts.map((c) => ({ id: c.id, planName: c.planName, status: c.status, address: c.address })),
      },
    };
  }

  /** Simulador: devolve o canal reservado `sgp:<id>`, que o Web Chat só aceita com login de admin. */
  @Post('simulate')
  @Roles('TENANT_ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async simulate(@Body() dto: SimulateDto) {
    const customer = await this.erp.getCustomer(dto.customerId);
    if (!customer) throw new NotFoundException('Cliente não localizado no ERP.');
    return { channelUserId: `${SGP_SIMULATOR_PREFIX}${customer.id}`, customerName: customer.name, customerId: customer.id };
  }
}
