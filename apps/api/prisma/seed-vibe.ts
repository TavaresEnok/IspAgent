/**
 * Cria (idempotente) o tenant `tnt_vibe` — o provedor REAL cujos dados vêm do PulseISP — com um admin
 * para configurar a conexão e usar o simulador no painel. Separado do seed determinístico (seção 9) de
 * propósito: não é dado DEMO, não entra no `verify.ps1`, e a senha do admin NÃO é fixa/conhecida — é
 * gerada uma vez e impressa (ou vem de ISPAGENT_VIBE_ADMIN_PASSWORD). Reexecutar não troca a senha.
 */
import { DEFAULT_KB_ARTICLES, defaultKbArticleId } from '../src/knowledge/default-articles';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const TENANT_ID = 'tnt_vibe';
const ADMIN_EMAIL = 'admin@vibe.ispagent.local';

async function main() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { name: 'Vibe Telecom (PulseISP real)' },
    create: { id: TENANT_ID, name: 'Vibe Telecom (PulseISP real)' },
  });

  await prisma.tenantPolicyConfig.upsert({
    where: { tenantId: TENANT_ID },
    update: {},
    create: { tenantId: TENANT_ID },
  });

  // Artigos técnicos padrão da Base de Conhecimento (documentos normais do tenant, editáveis no painel).
  for (const article of DEFAULT_KB_ARTICLES) {
    const id = defaultKbArticleId(TENANT_ID, article.slug);
    await prisma.knowledgeDocument.upsert({
      where: { id },
      update: {},
      create: { id, tenantId: TENANT_ID, title: article.title, content: article.content, source: article.source },
    });
  }

  const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: TENANT_ID, email: ADMIN_EMAIL } } });
  const fromEnv = process.env.ISPAGENT_VIBE_ADMIN_PASSWORD;

  if (existing && !fromEnv) {
    console.log(`[seed-vibe] tenant ${TENANT_ID} e admin ${ADMIN_EMAIL} já existem — senha mantida.`);
    return;
  }

  const password = fromEnv ?? randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: TENANT_ID, email: ADMIN_EMAIL } },
    update: { passwordHash, active: true },
    create: { tenantId: TENANT_ID, email: ADMIN_EMAIL, passwordHash, role: 'TENANT_ADMIN', name: 'Admin Vibe' },
  });

  console.log(`[seed-vibe] tenant ${TENANT_ID} criado.`);
  console.log(`[seed-vibe] login do painel: ${ADMIN_EMAIL}`);
  console.log(`[seed-vibe] senha (só aparece agora): ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
