import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Docker Compose sonda isto a cada 5s (docker-compose.yml) — nunca pode ser afetado por rate
  // limiting, senão um pico de tráfego legítimo derruba o healthcheck e reinicia o container à toa.
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    let db = 'unknown';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'error';
    }
    return {
      status: 'ok',
      service: 'ispagent-api',
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
