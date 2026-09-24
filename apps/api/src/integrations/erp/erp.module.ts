import { Module } from '@nestjs/common';
import { ERP_ADAPTER } from './erp-adapter.interface';
import { MockERPAdapter } from './mock-erp.adapter';
import { IXCAdapter } from './ixc.adapter';
import { SGPAdapter } from './sgp.adapter';
import { SgpClientService } from './sgp-client.service';
import { SgpController } from './sgp.controller';

/**
 * Seleciona o ERPAdapter concreto por `ISPAGENT_ERP_PROVIDER` (demo|ixc|sgp — default demo). Nenhum
 * consumidor (tools, agent) importa `MockERPAdapter`/`IXCAdapter`/`SGPAdapter` diretamente — só o token
 * `ERP_ADAPTER`, para trocar de provider sem tocar em regra de negócio.
 */
@Module({
  controllers: [SgpController],
  providers: [
    SgpClientService,
    MockERPAdapter,
    IXCAdapter,
    SGPAdapter,
    {
      provide: ERP_ADAPTER,
      useFactory: (mock: MockERPAdapter, ixc: IXCAdapter, sgp: SGPAdapter) => {
        switch (process.env.ISPAGENT_ERP_PROVIDER) {
          case 'ixc':
            return ixc;
          case 'sgp':
            return sgp;
          default:
            return mock;
        }
      },
      inject: [MockERPAdapter, IXCAdapter, SGPAdapter],
    },
  ],
  exports: [ERP_ADAPTER, SgpClientService, SGPAdapter],
})
export class ERPModule {}
