/**
 * Limpa todos os dados DEMO/sintéticos do banco do ISPAgent, mantendo intactas:
 * 1. O tenant Vibe Telecom (`tnt_vibe`) e sua política;
 * 2. O usuário admin da Vibe (`admin@vibe.ispagent.local` / `Vibe!2026`);
 * 3. As credenciais e configurações de IA (`ai_provider_credentials` e `ai_provider_configs`);
 * 4. A conexão configurada com a API do PulseISP (`pulseisp_connections`).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const PRESERVED_TENANT_ID = 'tnt_vibe';
const ADMIN_EMAIL = 'admin@vibe.ispagent.local';
const CONFIRMATION = 'APAGAR-DADOS-DEMO';

async function main() {
  // Este script apaga TODOS os clientes, conversas, faturas, chamados e auditoria de TODOS os tenants
  // (inclusive do tnt_vibe). Não roda por acidente.
  if (process.env.ISPAGENT_CLEAN_CONFIRM !== CONFIRMATION) {
    console.error(
      `Recusado: isto apaga clientes, conversas e auditoria de todos os tenants.\n` +
        `Se é isso mesmo que você quer, rode com ISPAGENT_CLEAN_CONFIRM=${CONFIRMATION}`,
    );
    process.exit(2);
  }
  console.log('--- INICIANDO LIMPEZA DE DADOS DEMO NO ISPAGENT ---');

  // 1. Garantir que o tenant Vibe existe antes de deletar os outros
  await prisma.tenant.upsert({
    where: { id: PRESERVED_TENANT_ID },
    update: { name: 'Vibe Telecom (SGP real / PulseISP)' },
    create: { id: PRESERVED_TENANT_ID, name: 'Vibe Telecom (SGP real / PulseISP)' },
  });

  await prisma.tenantPolicyConfig.upsert({
    where: { tenantId: PRESERVED_TENANT_ID },
    update: {},
    create: { tenantId: PRESERVED_TENANT_ID },
  });

  // 2. Garantir usuário admin para tnt_vibe. Nunca há senha fixa no código: se o admin já existe a senha
  // é mantida (a menos que ISPAGENT_VIBE_ADMIN_PASSWORD seja informada); se não existe, usa a variável ou
  // gera uma aleatória, impressa uma única vez.
  const existingAdmin = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: PRESERVED_TENANT_ID, email: ADMIN_EMAIL } },
  });
  const fromEnv = process.env.ISPAGENT_VIBE_ADMIN_PASSWORD;
  if (!existingAdmin || fromEnv) {
    const password = fromEnv ?? randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: PRESERVED_TENANT_ID, email: ADMIN_EMAIL } },
      update: { passwordHash, active: true, name: 'Admin Vibe Telecom' },
      create: {
        tenantId: PRESERVED_TENANT_ID,
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'TENANT_ADMIN',
        name: 'Admin Vibe Telecom',
        active: true,
      },
    });
    if (!fromEnv) console.log(`[OK] Senha gerada para ${ADMIN_EMAIL} (só aparece agora): ${password}`);
  }

  console.log(`[OK] Tenant ${PRESERVED_TENANT_ID} e admin ${ADMIN_EMAIL} garantidos.`);

  // 3. Deletar dependências de conversas e atendimentos (todas as conversas/mensagens demo)
  const delToolCalls = await prisma.toolCall.deleteMany();
  console.log(`[LIMPEZA] ToolCalls removidos: ${delToolCalls.count}`);

  const delAgentRuns = await prisma.agentRun.deleteMany();
  console.log(`[LIMPEZA] AgentRuns removidos: ${delAgentRuns.count}`);

  const delHandoffs = await prisma.handoff.deleteMany();
  console.log(`[LIMPEZA] Handoffs removidos: ${delHandoffs.count}`);

  await prisma.satisfactionSurvey.deleteMany();
  await prisma.cancellationRequest.deleteMany();

  const delMessages = await prisma.message.deleteMany();
  console.log(`[LIMPEZA] Mensagens removidas: ${delMessages.count}`);

  const delConversations = await prisma.conversation.deleteMany();
  console.log(`[LIMPEZA] Conversas removidas: ${delConversations.count}`);

  // 4. Deletar faturas, chamados, contratos, clientes e planos
  const delInvoices = await prisma.invoice.deleteMany();
  console.log(`[LIMPEZA] Faturas removidas: ${delInvoices.count}`);

  const delTickets = await prisma.supportTicket.deleteMany();
  console.log(`[LIMPEZA] Chamados removidos: ${delTickets.count}`);

  const delContracts = await prisma.contract.deleteMany();
  console.log(`[LIMPEZA] Contratos removidos: ${delContracts.count}`);

  const delCustomers = await prisma.customer.deleteMany();
  console.log(`[LIMPEZA] Clientes removidos: ${delCustomers.count}`);

  const delPlans = await prisma.plan.deleteMany();
  console.log(`[LIMPEZA] Planos removidos: ${delPlans.count}`);

  const delKnowledge = await prisma.knowledgeDocument.deleteMany();
  console.log(`[LIMPEZA] Documentos de conhecimento demo removidos: ${delKnowledge.count}`);

  const delAudit = await prisma.auditLog.deleteMany();
  console.log(`[LIMPEZA] Audit logs antigos removidos: ${delAudit.count}`);

  // 5. Deletar refresh tokens e usuários de tenants que NÃO sejam tnt_vibe
  const delTokens = await prisma.refreshToken.deleteMany({
    where: { user: { tenantId: { not: PRESERVED_TENANT_ID } } },
  });
  console.log(`[LIMPEZA] RefreshTokens de outros tenants removidos: ${delTokens.count}`);

  const delUsers = await prisma.user.deleteMany({
    where: { tenantId: { not: PRESERVED_TENANT_ID } },
  });
  console.log(`[LIMPEZA] Usuários demo removidos: ${delUsers.count}`);

  // 6. Remover configs e credenciais de tenants que NÃO sejam tnt_vibe (preserva tnt_vibe!)
  const delPolicyConfigs = await prisma.tenantPolicyConfig.deleteMany({
    where: { tenantId: { not: PRESERVED_TENANT_ID } },
  });
  console.log(`[LIMPEZA] TenantPolicyConfigs demo removidos: ${delPolicyConfigs.count}`);

  const delAiConfigs = await prisma.aiProviderConfig.deleteMany({
    where: { tenantId: { not: PRESERVED_TENANT_ID } },
  });
  console.log(`[LIMPEZA] AiProviderConfigs demo removidos: ${delAiConfigs.count}`);

  const delAiCreds = await prisma.aiProviderCredential.deleteMany({
    where: { tenantId: { not: PRESERVED_TENANT_ID } },
  });
  console.log(`[LIMPEZA] AiProviderCredentials demo removidos: ${delAiCreds.count}`);

  const delPulseConns = await prisma.pulseIspConnection.deleteMany({
    where: { tenantId: { not: PRESERVED_TENANT_ID } },
  });
  console.log(`[LIMPEZA] PulseIspConnections demo removidos: ${delPulseConns.count}`);

  // 7. Remover tenants demo
  const delTenants = await prisma.tenant.deleteMany({
    where: { id: { not: PRESERVED_TENANT_ID } },
  });
  console.log(`[LIMPEZA] Tenants demo removidos: ${delTenants.count}`);

  // 8. Relatório final de conferência
  console.log('\n--- VERIFICAÇÃO PÓS-LIMPEZA ---');
  const remainingTenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log('Tenants remanescentes:', remainingTenants);

  const remainingUsers = await prisma.user.findMany({ select: { id: true, email: true, tenantId: true, role: true } });
  console.log('Usuários remanescentes:', remainingUsers);

  const remainingAiCreds = await prisma.aiProviderCredential.findMany({ select: { tenantId: true, provider: true, model: true } });
  console.log('Credenciais de IA preservadas:', remainingAiCreds);

  const remainingPulseConn = await prisma.pulseIspConnection.findMany({ select: { tenantId: true, baseUrl: true, email: true } });
  console.log('Conexão PulseISP preservada:', remainingPulseConn);

  const customerCount = await prisma.customer.count();
  const contractCount = await prisma.contract.count();
  const conversationCount = await prisma.conversation.count();
  console.log(`Total Clientes: ${customerCount}, Total Contratos: ${contractCount}, Total Conversas: ${conversationCount}`);

  console.log('\n--- LIMPEZA CONCLUÍDA COM SUCESSO! ---');
  console.log(`Acesse o painel com o e-mail ${ADMIN_EMAIL} (a senha não é exibida aqui).`);
}

main()
  .catch((e) => {
    console.error('Erro durante a limpeza:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
