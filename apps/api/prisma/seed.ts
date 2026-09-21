/**
 * Seed determinístico (seção 9 do prompt de execução). Banco limpo + este script = mesmos IDs lógicos
 * sempre. `scripts/verify.ps1` depende disso. Usa o PrismaClient cru (sem a extensão de tenant-scoping)
 * porque seed é, por natureza, uma operação administrativa cross-tenant.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo!2026';

async function upsertTenant(id: string, name: string) {
  return prisma.tenant.upsert({ where: { id }, update: { name }, create: { id, name } });
}

async function upsertUser(params: {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  name: string;
}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId: params.tenantId, email: params.email } },
    update: { passwordHash, role: params.role, name: params.name, active: true },
    create: {
      id: params.id,
      tenantId: params.tenantId,
      email: params.email,
      passwordHash,
      role: params.role,
      name: params.name,
    },
  });
}

async function main() {
  // O seed cria contas DEMO com senha conhecida (Demo!2026): jamais em produção.
  if (process.env.ISPAGENT_ENV === 'production') {
    throw new Error('[seed] recusado: o seed DEMO cria usuários com senha conhecida e não roda com ISPAGENT_ENV=production.');
  }
  console.log('[seed] iniciando seed determinístico...');

  const alpha = await upsertTenant('tnt_demo_alpha', 'Provedor Alpha');
  const beta = await upsertTenant('tnt_demo_beta', 'Provedor Beta');

  await prisma.tenantPolicyConfig.upsert({
    where: { tenantId: alpha.id },
    update: {},
    create: { tenantId: alpha.id },
  });
  await prisma.tenantPolicyConfig.upsert({
    where: { tenantId: beta.id },
    update: {},
    create: { tenantId: beta.id },
  });

  await upsertUser({
    id: 'usr_admin_alpha',
    tenantId: alpha.id,
    email: 'admin@alpha.ispagent.local',
    role: 'TENANT_ADMIN',
    name: 'Admin Alpha',
  });
  await upsertUser({
    id: 'usr_operador_alpha',
    tenantId: alpha.id,
    email: 'operador@alpha.ispagent.local',
    role: 'AGENT',
    name: 'Operador Alpha',
  });
  await upsertUser({
    id: 'usr_admin_beta',
    tenantId: beta.id,
    email: 'admin@beta.ispagent.local',
    role: 'TENANT_ADMIN',
    name: 'Admin Beta',
  });

  // ---- Catálogo de planos (tenant Alpha) ----
  const plans = [
    { id: 'plan_demo_old_50', name: 'Internet 50 Mega (legado)', downloadMbps: 50, uploadMbps: 10, priceCents: 8990 },
    { id: 'plan_demo_100', name: 'Internet 100 Mega', downloadMbps: 100, uploadMbps: 50, priceCents: 9990 },
    { id: 'plan_demo_300', name: 'Internet 300 Mega', downloadMbps: 300, uploadMbps: 150, priceCents: 12990 },
    { id: 'plan_demo_500', name: 'Internet 500 Mega', downloadMbps: 500, uploadMbps: 250, priceCents: 15990 },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { id: p.id },
      update: { ...p, tenantId: alpha.id },
      create: { ...p, tenantId: alpha.id },
    });
  }

  type CustomerSeed = {
    id: string;
    name: string;
    document: string;
    phones: string[];
    email: string;
    planId: string;
    contractId: string;
    contractStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
    invoice?: { status: 'PAID' | 'OPEN' | 'OVERDUE'; dueOffsetDays: number };
    ticket?: { status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; category: string; description: string };
  };

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000);

  const customers: CustomerSeed[] = [
    {
      id: 'cus_demo_a',
      name: 'Ana Ferreira Souza',
      document: '111.111.111-01',
      phones: ['+5511999990001'],
      email: 'ana.souza@example.invalid',
      planId: 'plan_demo_300',
      contractId: 'ctt_demo_a',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -5 },
    },
    {
      id: 'cus_demo_b',
      name: 'Bruno Almeida Lima',
      document: '111.111.111-02',
      phones: ['+5511999990002'],
      email: 'bruno.lima@example.invalid',
      planId: 'plan_demo_100',
      contractId: 'ctt_demo_b',
      contractStatus: 'ACTIVE',
      invoice: { status: 'OVERDUE', dueOffsetDays: -20 },
    },
    {
      id: 'cus_demo_c',
      name: 'Carla Mendes Rocha',
      document: '111.111.111-03',
      phones: ['+5511999990003'],
      email: 'carla.rocha@example.invalid',
      planId: 'plan_demo_300',
      contractId: 'ctt_demo_c',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -3 },
    },
    {
      id: 'cus_demo_d',
      name: 'Diego Nascimento Costa',
      document: '111.111.111-04',
      phones: ['+5511999990004'],
      email: 'diego.costa@example.invalid',
      planId: 'plan_demo_300',
      contractId: 'ctt_demo_d',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -2 },
    },
    {
      id: 'cus_demo_e',
      name: 'Elaine Pereira Dias',
      document: '111.111.111-05',
      phones: ['+5511999990005'],
      email: 'elaine.dias@example.invalid',
      planId: 'plan_demo_old_50',
      contractId: 'ctt_demo_e',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -1 },
    },
    {
      id: 'cus_demo_f',
      name: 'Fábio Ribeiro Santos',
      document: '111.111.111-06',
      phones: ['+5511999990006'],
      email: 'fabio.santos@example.invalid',
      planId: 'plan_demo_100',
      contractId: 'ctt_demo_f',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -8 },
      ticket: {
        status: 'OPEN',
        category: 'TECNICO',
        description: 'Cliente relatou lentidão intermitente durante a noite; técnico já acionado.',
      },
    },
    {
      id: 'cus_demo_g',
      name: 'Gabriel Teixeira Martins',
      document: '111.111.111-07',
      phones: ['+5511999990007'],
      email: 'gabriel.martins@example.invalid',
      planId: 'plan_demo_100',
      contractId: 'ctt_demo_g',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -4 },
    },
    {
      // Mesmo telefone de cus_demo_g, de propósito: modela "identidade ambígua" (dois contratos
      // resolvendo para o mesmo telefone, cada um em um cliente distinto no ERP). Não faz parte da
      // tabela de 8 IDs oficiais da seção 9 porque existe só para tornar a ambiguidade de cus_demo_g
      // real e testável (P0.7) — sem um segundo registro compartilhando o telefone não haveria
      // ambiguidade nenhuma para resolver.
      id: 'cus_demo_g2',
      name: 'Giovana Teixeira Martins',
      document: '111.111.111-08',
      phones: ['+5511999990007'],
      email: 'giovana.martins@example.invalid',
      planId: 'plan_demo_300',
      contractId: 'ctt_demo_g2',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -6 },
    },
    {
      // Sem telefone cadastrado no ERP → identity resolution por telefone nunca encontra este cliente
      // (P0.7 / cenário "não identificado" da seção 9).
      id: 'cus_demo_h',
      name: 'Heitor Cardoso Pinto',
      document: '111.111.111-09',
      phones: [],
      email: 'heitor.pinto@example.invalid',
      planId: 'plan_demo_100',
      contractId: 'ctt_demo_h',
      contractStatus: 'ACTIVE',
      invoice: { status: 'PAID', dueOffsetDays: -7 },
    },
  ];

  for (const [index, c] of customers.entries()) {
    const streetNumber = (index + 1) * 100;
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {
        tenantId: alpha.id,
        name: c.name,
        document: c.document,
        phones: c.phones,
        email: c.email,
      },
      create: {
        id: c.id,
        tenantId: alpha.id,
        name: c.name,
        document: c.document,
        phones: c.phones,
        email: c.email,
      },
    });

    await prisma.contract.upsert({
      where: { id: c.contractId },
      update: {
        tenantId: alpha.id,
        customerId: c.id,
        planId: c.planId,
        status: c.contractStatus,
        address: `Rua Demonstração, ${streetNumber} — São Paulo/SP`,
        installedAt: daysAgo(365),
      },
      create: {
        id: c.contractId,
        tenantId: alpha.id,
        customerId: c.id,
        planId: c.planId,
        status: c.contractStatus,
        address: `Rua Demonstração, ${streetNumber} — São Paulo/SP`,
        installedAt: daysAgo(365),
      },
    });

    if (c.invoice) {
      const invoiceId = `inv_${c.contractId.replace('ctt_', '')}_current`;
      const due = daysFromNow(c.invoice.dueOffsetDays);
      await prisma.invoice.upsert({
        where: { id: invoiceId },
        update: {
          tenantId: alpha.id,
          contractId: c.contractId,
          referenceMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          amountCents: 9990,
          status: c.invoice.status,
          dueDate: due,
          paidAt: c.invoice.status === 'PAID' ? due : null,
          barcodeUrl: c.invoice.status === 'PAID' ? null : `https://faturas.demo.invalid/${invoiceId}`,
        },
        create: {
          id: invoiceId,
          tenantId: alpha.id,
          contractId: c.contractId,
          referenceMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          amountCents: 9990,
          status: c.invoice.status,
          dueDate: due,
          paidAt: c.invoice.status === 'PAID' ? due : null,
          barcodeUrl: c.invoice.status === 'PAID' ? null : `https://faturas.demo.invalid/${invoiceId}`,
        },
      });
    }

    if (c.ticket) {
      const ticketId = `tkt_${c.contractId.replace('ctt_', '')}_1`;
      await prisma.supportTicket.upsert({
        where: { id: ticketId },
        update: {
          tenantId: alpha.id,
          contractId: c.contractId,
          status: c.ticket.status,
          category: c.ticket.category,
          description: c.ticket.description,
        },
        create: {
          id: ticketId,
          tenantId: alpha.id,
          contractId: c.contractId,
          status: c.ticket.status,
          category: c.ticket.category,
          description: c.ticket.description,
          idempotencyKey: `seed-${ticketId}`,
        },
      });
    }
  }

  // ---- Knowledge Base (Fase 6) ----
  const knowledgeDocs = [
    {
      id: 'kb_demo_internet_lenta',
      title: 'Internet lenta: primeiros passos',
      content:
        'Se a internet está lenta, peça ao cliente para reiniciar o roteador (desligar por 10 segundos) ' +
        'e testar a velocidade via cabo, não Wi-Fi. Muitos roteadores domésticos têm limite de dispositivos ' +
        'simultâneos — perguntar quantos aparelhos estão conectados ajuda a diagnosticar.',
      source: 'Base de conhecimento interna — Suporte Técnico',
    },
    {
      id: 'kb_demo_segunda_via',
      title: 'Como emitir segunda via de fatura',
      content:
        'A segunda via de fatura pode ser consultada diretamente pelo BillingTool a partir do contrato do ' +
        'cliente. Faturas em atraso há mais de 15 dias podem gerar bloqueio financeiro automático.',
      source: 'Base de conhecimento interna — Financeiro',
    },
    {
      id: 'kb_demo_troca_senha_wifi',
      title: 'Como o cliente troca a senha do Wi-Fi',
      content:
        'Oriente o cliente a acessar o painel do roteador (geralmente 192.168.0.1 ou 192.168.1.1) com o ' +
        'usuário e senha padrão, que ficam na etiqueta do aparelho, e trocar a senha na seção de rede sem fio.',
      source: 'Base de conhecimento interna — Suporte Técnico',
    },
  ];

  for (const doc of knowledgeDocs) {
    await prisma.knowledgeDocument.upsert({
      where: { id: doc.id },
      update: { tenantId: alpha.id, title: doc.title, content: doc.content, source: doc.source },
      create: { id: doc.id, tenantId: alpha.id, title: doc.title, content: doc.content, source: doc.source },
    });
  }

  console.log('[seed] concluído: 2 tenants, 3 usuários, 4 planos, 9 clientes/contratos, 3 documentos de KB.');
}

main()
  .catch((err) => {
    console.error('[seed] falhou:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
