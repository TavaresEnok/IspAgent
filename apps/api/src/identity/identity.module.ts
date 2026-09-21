import { Module } from '@nestjs/common';
import { IdentityResolutionService } from './identity-resolution.service';

@Module({
  providers: [IdentityResolutionService],
  exports: [IdentityResolutionService],
})
export class IdentityModule {}
