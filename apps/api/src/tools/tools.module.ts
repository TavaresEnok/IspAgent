import { Module } from '@nestjs/common';
import { ToolExecutorService } from './tool-executor.service';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [PolicyModule],
  providers: [ToolExecutorService],
  exports: [ToolExecutorService],
})
export class ToolsModule {}
