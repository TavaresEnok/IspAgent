import { Module } from '@nestjs/common';
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
 * `RealPulseISPAdapter`; o resto continua no mock DEMO.
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
      useFactory: (mock: MockPulseISPAdapter, real: RealPulseISPAdapter) => new TenantPulseISPAdapter(mock, real),
      inject: [MockPulseISPAdapter, RealPulseISPAdapter],
    },
  ],
  exports: [PULSEISP_ADAPTER, PulseIspConnectionService, PulseIspClient, PulseIspMirrorService],
})
export class PulseISPModule {}
