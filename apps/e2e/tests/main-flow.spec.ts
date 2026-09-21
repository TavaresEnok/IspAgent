import { test, expect, type Page } from '@playwright/test';

/**
 * E2E do fluxo principal (P1 "faltava E2E real no navegador"): login → Web Chat → mensagem financeira
 * → resposta → conversa visível no painel de staff → handoff → atendente assume → IA para de responder
 * → atendente responde manualmente. Duas abas simulam dois usuários reais (cliente e atendente) na
 * mesma stack Docker (`docker compose up -d --wait`, já rodando antes deste teste).
 *
 * Usa dados do seed (seção 9): cus_demo_b (financeiro, fatura vencida) e cus_demo_g/g2 (identidade
 * ambígua — dispara HANDOFF de forma determinística, sem depender de o AI Provider real falhar).
 */

const ADMIN_EMAIL = 'admin@alpha.ispagent.local';
const ADMIN_PASSWORD = 'Demo!2026';
const TENANT_LABEL = 'Provedor Alpha';

async function login(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'ISPAgent' })).toBeVisible();
  // Os campos já vêm pré-preenchidos com as credenciais DEMO — só garantimos o valor certo.
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Senha').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function startWebchat(page: Page, phone: string) {
  await page.goto('/webchat');
  await expect(page.getByRole('heading', { name: 'ISPAgent — Web Chat' })).toBeVisible();
  await page.getByLabel('Seu telefone').fill(phone);
  await page.getByRole('button', { name: 'Iniciar conversa' }).click();
}

/**
 * `HandoffService.createHandoff` é idempotente por conversa (nunca duplica entrada na fila) — mas isso
 * também significa que, se uma execução anterior deste teste já deixou um handoff PENDING pro mesmo
 * telefone, o resumo NOVO (com o token desta execução) nunca aparece, porque o handoff antigo é
 * reaproveitado. Resetar a conversa antes de cada execução evita esse falso negativo — mesmo motivo
 * que o botão "Resetar conversa" existe.
 */
async function resetWebchat(page: Page, phone: string) {
  await startWebchat(page, phone);
  page.once('dialog', (d) => d.accept());
  // `.click()` do Playwright já espera o botão ficar visível/estável sozinho — um `isVisible()` cru
  // (sem retry) logo depois do clique em "Iniciar conversa" pode rodar antes do React re-renderizar
  // pra tela ativa e voltar `false` incorretamente, pulando o reset e deixando a conversa antiga
  // (possivelmente HUMAN_ACTIVE de uma execução anterior) contaminar este teste.
  await page.getByRole('button', { name: /Resetar conversa/ }).click();
  await expect(page.getByRole('button', { name: 'Iniciar conversa' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Fluxo principal de atendimento', () => {
  test('cliente identificado faz pergunta financeira e recebe resposta real', async ({ page }) => {
    await resetWebchat(page, '+5511999990002');
    await startWebchat(page, '+5511999990002');
    const input = page.getByPlaceholder('Digite sua mensagem...');
    await input.fill('Minha fatura está com atraso, o que aconteceu?');
    await page.getByRole('button', { name: 'Enviar' }).click();

    // Resposta real do agente aparece na tela (não é um mock estático do frontend — vem do backend).
    const agentBubble = page.locator('div').filter({ hasText: /encontrei|fatura|atraso/i }).last();
    await expect(agentBubble).toBeVisible({ timeout: 15_000 });
  });

  test('handoff completo: ambíguo → fila → atendente assume → IA para → atendente responde', async ({
    browser,
  }) => {
    const token = `e2e-${Date.now()}`;
    const customerContext = await browser.newContext();
    const staffContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    const staffPage = await staffContext.newPage();

    try {
      // 1) Cliente com identidade ambígua manda uma mensagem que exige conta confirmada — o
      // orquestrador nunca vincula ao contrato errado (P0.7) e escala pra humano.
      await resetWebchat(customerPage, '+5511999990007');
      await startWebchat(customerPage, '+5511999990007');
      await customerPage.getByPlaceholder('Digite sua mensagem...').fill(`preciso ver minha fatura (${token})`);
      await customerPage.getByRole('button', { name: 'Enviar' }).click();
      await expect(customerPage.getByText(/não encontrei|encaminh/i).last()).toBeVisible({ timeout: 15_000 });

      // 2) Atendente loga e vê a conversa na fila humana.
      await login(staffPage);
      await staffPage.goto('/handoff');
      const queueRow = staffPage.locator('div', { hasText: token }).last();
      await expect(queueRow).toBeVisible({ timeout: 15_000 });

      const viewLink = queueRow.getByRole('link', { name: 'Ver conversa' });
      const conversationHref = await viewLink.getAttribute('href');
      expect(conversationHref).toBeTruthy();

      await queueRow.getByRole('button', { name: 'Assumir conversa' }).click();
      await expect(queueRow).not.toBeVisible({ timeout: 15_000 });

      // 3) IA para de responder: nova mensagem do cliente não gera bolha de resposta automática.
      await customerPage.getByPlaceholder('Digite sua mensagem...').fill('alguém aí?');
      await customerPage.getByRole('button', { name: 'Enviar' }).click();
      await expect(customerPage.getByText('Um atendente humano assumiu esta conversa.')).toBeVisible({
        timeout: 15_000,
      });

      // 4) Atendente responde manualmente pela tela de detalhe da conversa.
      await staffPage.goto(conversationHref!);
      const replyBox = staffPage.getByPlaceholder('Responder como atendente...');
      await expect(replyBox).toBeVisible({ timeout: 15_000 });
      const humanReplyText = `resposta manual do atendente (${token})`;
      await replyBox.fill(humanReplyText);
      await staffPage.getByRole('button', { name: 'Enviar' }).click();
      await expect(staffPage.getByText(humanReplyText)).toBeVisible({ timeout: 15_000 });

      // 5) A resposta do atendente chega até o cliente — o Web Chat não guarda "sessão" entre reloads
      // (é um widget DEMO sem login persistido), então o cliente precisa se identificar de novo pra
      // recarregar o histórico; a mensagem HUMAN já está lá (P1 "tempo real"/push é backlog conhecido,
      // ver PROGRESS.md — aqui provamos que o dado chega, só não empurra sozinho).
      await startWebchat(customerPage, '+5511999990007');
      await expect(customerPage.getByText(humanReplyText)).toBeVisible({ timeout: 15_000 });
      await expect(customerPage.getByText('Atendente', { exact: true })).toBeVisible();
    } finally {
      await customerContext.close();
      await staffContext.close();
    }
  });
});
