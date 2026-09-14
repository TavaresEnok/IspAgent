import { Module } from '@nestjs/common';
import { PULSEISP_ADAPTER } from './pulseisp-adapter.interface';
import { MockPulseISPAdapter } from './mock-pulseisp.adapter';
import { RealPulseISPAdapter } from './real-pulseisp.adapter';

/**
 * PulseISP é sempre opcional (seção 3.2) — `ISPAGENT_PULSEISP_ENABLED` (lido pelo
 * AgentOrchestratorService, não aqui) decide se a ferramenta é usada num turno. Este módulo só decide
 * QUAL adapter usar quando ela É chamada: mock (sempre funciona) ou o real (stub, sem API validada).
 */
@Module({
  providers: [
    MockPulseISPAdapter,
    RealPulseISPAdapter,
    {
      provide: PULSEISP_ADAPTER,
      useFactory: (mock: MockPulseISPAdapter, real: RealPulseISPAdapter) =>
        process.env.ISPAGENT_PULSEISP_PROVIDER === 'real' ? real : mock,
      inject: [MockPulseISPAdapter, RealPulseISPAdapter],
    },
  ],
  exports: [PULSEISP_ADAPTER],
})
export class PulseISPModule {}
