import { Controller, Get, Query } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get()
  @Roles('SUPERVISOR', 'TENANT_ADMIN', 'SUPER_ADMIN')
  async list(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    const take = Math.min(Number(pageSize) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      this.db.client.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take, skip }),
      this.db.client.auditLog.count(),
    ]);

    return { items, total, page: Number(page) || 1, pageSize: take };
  }
}
