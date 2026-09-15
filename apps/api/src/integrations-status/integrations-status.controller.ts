import { Controller, Get } from '@nestjs/common';

/**
 * Tela "Integrações" (seção 10.1) — status HONESTO de cada adapter, o mesmo espírito de
 * docs/integration-capability-matrix.md, exposto para a UI em vez de só markdown estático.
 */
@Controller('integrations/status')
export class IntegrationsStatusController {
  @Get()
  status() {
    const erpProvider = process.env.ISPAGENT_ERP_PROVIDER ?? 'demo';
    const aiConfigured = process.env.ISPAGENT_AI_PROVIDER ?? 'anthropic';
    const hasAnthropicKey = Boolean(process.env.ISPAGENT_ANTHROPIC_API_KEY);
    const pulseIspEnabled = process.env.ISPAGENT_PULSEISP_ENABLED === 'true';
    const whatsappEnabled = process.env.ISPAGENT_CHANNEL_WHATSAPP_ENABLED === 'true';

    return {
      erp: {
        provider: erpProvider,
        mode: erpProvider === 'demo' ? 'DEMO' : 'LIVE',
        status: erpProvider === 'demo' ? 'VALIDADO (mock real contra Postgres)' : 'ESTRUTURADO, NÃO VALIDADO',
      },
      ai: {
        provider: aiConfigured === 'anthropic' && hasAnthropicKey ? 'anthropic' : 'mock',
        mode: aiConfigured === 'anthropic' && hasAnthropicKey ? 'LIVE' : 'DEMO',
        status:
          aiConfigured === 'anthropic' && hasAnthropicKey
            ? 'VALIDADO'
            : 'MockAIProvider ativo (sem ISPAGENT_ANTHROPIC_API_KEY)',
      },
      pulseisp: {
        enabled: pulseIspEnabled,
        mode: 'DEMO',
        status: pulseIspEnabled ? 'VALIDADO (mock)' : 'DESLIGADO — produto funciona sem PulseISP (seção 3.2)',
      },
      whatsapp: {
        enabled: whatsappEnabled,
        status: 'INDISPONÍVEL — sem credencial Meta validada nesta sessão',
      },
      webchat: { enabled: true, status: 'VALIDADO — canal obrigatório do DEMO' },
    };
  }
}
