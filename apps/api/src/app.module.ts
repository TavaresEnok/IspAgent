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
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AgentModule } from './agent/agent.module';
import { HandoffModule } from './handoff/handoff.module';
import { ChannelsModule } from './channels/channels.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CustomersModule } from './customers/customers.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { IntegrationsStatusModule } from './integrations-status/integrations-status.module';

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
    KnowledgeModule,
    AgentModule,
    HandoffModule,
    ChannelsModule,
    ConversationsModule,
    DashboardModule,
    CustomersModule,
    AuditModule,
    UsersModule,
    IntegrationsStatusModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
