import { Module } from '@nestjs/common';
import { ERP_ADAPTER } from './erp-adapter.interface';
import { MockERPAdapter } from './mock-erp.adapter';
import { IXCAdapter } from './ixc.adapter';
import { SGPAdapter } from './sgp.adapter';
import { SgpClientService } from './sgp-client.service';
import { SgpController } from './sgp.controller';
import { ErpConnectionService } from './erp-connection.service';
import { ErpConnectionController } from './erp-connection.controller';
import { TenantErpAdapter } from './tenant-erp.adapter';

/**
 * `ERP_ADAPTER` = `TenantErpAdapter`: o ERP é escolhido POR PROVEDOR (tela "ERP", tabela
 * `erp_connections`), a cada chamada. Nenhum consumidor (tools, agent) importa `MockERPAdapter`/
 * `SGPAdapter` diretamente — só o token, para trocar de ERP sem tocar em regra de negócio. IXC continua
 * não implementado (sem documentação validada) e não é oferecido na tela.
 */
@Module({
  controllers: [SgpController, ErpConnectionController],
  providers: [
    SgpClientService,
    ErpConnectionService,
    MockERPAdapter,
    IXCAdapter,
    SGPAdapter,
    TenantErpAdapter,
    { provide: ERP_ADAPTER, useExisting: TenantErpAdapter },
  ],
  exports: [ERP_ADAPTER, SgpClientService, SGPAdapter, ErpConnectionService],
})
export class ERPModule {}
