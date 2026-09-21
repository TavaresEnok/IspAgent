import { defineConfig } from '@playwright/test';

/**
 * E2E do fluxo principal de atendimento (seção 11, item P1 pendente "faltava E2E real no navegador").
 * Roda contra a stack Docker já em pé (`docker compose up -d --wait`, como `verify.ps1` já assume) —
 * não sobe/derruba containers sozinho, pra não duplicar a responsabilidade que já é do verify.ps1 nem
 * mascarar problema de build atrás de um restart automático.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.ISPAGENT_E2E_WEB_URL ?? 'http://localhost:3010',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
