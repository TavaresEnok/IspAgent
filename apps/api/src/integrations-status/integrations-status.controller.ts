import { Controller, Get } from '@nestjs/common';
import { currentTenantId } from '../common/tenant-context';
import { AiConfigService } from '../integrations/ai/ai-config.service';

/**
 * Tela "Integrações" (seção 10.1) — status HONESTO de cada adapter, o mesmo espírito de
 * docs/integration-capability-matrix.md, exposto para a UI em vez de só markdown estático.
 */
@Controller('integrations/status')
export class IntegrationsStatusController {
  constructor(private readonly aiConfig: AiConfigService) {}

  @Get()
  async status() {
    const erpProvider = process.env.ISPAGENT_ERP_PROVIDER ?? 'demo';
    const pulseIspEnabled = process.env.ISPAGENT_PULSEISP_ENABLED === 'true';
    const whatsappEnabled = process.env.ISPAGENT_CHANNEL_WHATSAPP_ENABLED === 'true';

    // Config de IA vem do banco (tela "IA" do painel), não mais de env var fixada no boot — ver
    // AiProviderResolverService.
    const overview = await this.aiConfig.getOverview(currentTenantId() as string);
    const activeCard = overview.providers.find((p) => p.isActive)!;
    const ai = { provider: overview.active, model: activeCard.model, hasApiKey: activeCard.hasApiKey };
    const aiLive = overview.effective !== 'mock';

    return {
      erp: {
        provider: erpProvider,
        mode: erpProvider === 'demo' ? 'DEMO' : 'LIVE',
        status: erpProvider === 'demo' ? 'VALIDADO (mock real contra Postgres)' : 'ESTRUTURADO, NÃO VALIDADO',
      },
      ai: {
        provider: aiLive ? ai.provider : 'mock',
        mode: aiLive ? 'LIVE' : 'DEMO',
        status: aiLive
          ? `VALIDADO (${ai.provider}${ai.model ? `, ${ai.model}` : ''})`
          : `MockAIProvider ativo — configure em Integrações › IA (provider selecionado: ${ai.provider}${ai.provider !== 'mock' ? ', sem chave' : ''})`,
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
