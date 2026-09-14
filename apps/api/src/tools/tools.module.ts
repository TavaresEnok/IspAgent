import { Module } from '@nestjs/common';
import { ToolExecutorService } from './tool-executor.service';
import { PolicyModule } from '../policy/policy.module';
import { ERPModule } from '../integrations/erp/erp.module';
import { ErpToolsService } from './erp-tools.service';

@Module({
  imports: [PolicyModule, ERPModule],
  providers: [ToolExecutorService, ErpToolsService],
  exports: [ToolExecutorService, ErpToolsService],
})
export class ToolsModule {}
