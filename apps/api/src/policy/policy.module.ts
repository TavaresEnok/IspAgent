import { Module } from '@nestjs/common';
import { PolicyEngineService } from './policy-engine.service';
import { PolicyController } from './policy.controller';

@Module({
  controllers: [PolicyController],
  providers: [PolicyEngineService],
  exports: [PolicyEngineService],
})
export class PolicyModule {}
