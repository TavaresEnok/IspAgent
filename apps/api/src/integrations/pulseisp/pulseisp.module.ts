import { Module } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { currentTenantId } from '../../common/tenant-context';
import { toPulseId } from './pulseisp-ids';
import { PULSEISP_ADAPTER } from './pulseisp-adapter.interface';
import { MockPulseISPAdapter } from './mock-pulseisp.adapter';
import { RealPulseISPAdapter } from './real-pulseisp.adapter';
import { TenantPulseISPAdapter } from './tenant-pulseisp.adapter';
import { PulseIspConnectionService } from './pulseisp-connection.service';
import { PulseIspClient } from './pulseisp-client.service';
import { PulseIspMirrorService } from './pulseisp-mirror.service';
import { PulseIspController } from './pulseisp.controller';

/**
 * PulseISP é sempre opcional (seção 3.2). O adapter injetado (`PULSEISP_ADAPTER`) roteia por contrato:
 * `pulse_*` (cliente real, escolhido no simulador do painel) vai pro PulseISP de verdade via
 * `RealPulseISPAdapter`; contrato de ERP real (`sgp_*`) também vai ao PulseISP real (localizado pelo CPF do
 * titular); só dado DEMO do seed continua no mock.
 */
@Module({
  controllers: [PulseIspController],
  providers: [
    MockPulseISPAdapter,
    PulseIspConnectionService,
    PulseIspClient,
    PulseIspMirrorService,
    RealPulseISPAdapter,
    {
      provide: PULSEISP_ADAPTER,
      useFactory: (mock: MockPulseISPAdapter, real: RealPulseISPAdapter, db: TenantPrismaService, client: PulseIspClient) =>
        new TenantPulseISPAdapter(mock, real, async (contractId) => {
          // Contrato do ERP → cliente no PulseISP pelo login PPPoE (= CPF do titular). Erro do PulseISP
          // propaga (vira UPSTREAM_ERROR e handoff), nunca "sem problemas".
          const tenantId = currentTenantId();
          const contract = await db.client.contract.findUnique({ where: { id: contractId }, include: { customer: true } });
          const document = contract?.customer.document.replace(/\D/g, '') ?? '';
          if (!tenantId || document.length !== 11) return null;
          const result = await client.searchCustomers(tenantId, document);
          const exact = result.items.filter((c) => c.contract?.pppoeLogin === document);
          return exact.length === 1 ? toPulseId(exact[0].id) : null;
        }),
      inject: [MockPulseISPAdapter, RealPulseISPAdapter, TenantPrismaService, PulseIspClient],
    },
  ],
  exports: [PULSEISP_ADAPTER, PulseIspConnectionService, PulseIspClient, PulseIspMirrorService],
})
export class PulseISPModule {}
