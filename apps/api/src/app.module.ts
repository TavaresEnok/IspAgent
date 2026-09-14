import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { IdentityModule } from './identity/identity.module';
import { ConversationModule } from './conversation/conversation.module';
import { PolicyModule } from './policy/policy.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenancyModule,
    IdentityModule,
    ConversationModule,
    PolicyModule,
    ToolsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
