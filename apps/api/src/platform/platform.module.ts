import { Global, Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { PlatformBootstrapService } from './platform-bootstrap.service';
import { PlatformController } from './platform.controller';
import { TenantAccessService } from './tenant-access.service';

/** Global: canais, autenticação e o orquestrador consultam status/limites do provedor. */
@Global()
@Module({
  controllers: [PlatformController, BrandingController],
  providers: [TenantAccessService, PlatformBootstrapService],
  exports: [TenantAccessService],
})
export class PlatformModule {}
