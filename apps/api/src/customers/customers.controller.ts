import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get()
  async list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const take = Math.min(Number(pageSize) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      this.db.client.customer.findMany({
        orderBy: { name: 'asc' },
        take,
        skip,
        include: { contracts: { select: { id: true, status: true, planId: true } } },
      }),
      this.db.client.customer.count(),
    ]);

    return { items, total, page: Number(page) || 1, pageSize: take };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const customer = await this.db.client.customer.findUnique({
      where: { id },
      include: {
        contracts: { include: { plan: true, invoices: true, tickets: true } },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }
}
