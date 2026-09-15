import { Controller, Get } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get()
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  async list() {
    return this.db.client.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
