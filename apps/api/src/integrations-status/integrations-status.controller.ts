import { Controller, Get } from '@nestjs/common';
import { currentTenantId } from '../common/tenant-context';
import { AiConfigService } from '../integrations/ai/ai-config.service';
import { ErpConnectionService } from '../integrations/erp/erp-connection.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tela "Integrações" (seção 10.1) — status HONESTO de cada adapter, o mesmo espírito de
 * docs/integration-capability-matrix.md, exposto para a UI em vez de só markdown estático.
 */
@Controller('integrations/status')
export class IntegrationsStatusController {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly erp: ErpConnectionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async status() {
    const tenantId = currentTenantId() as string;
    // Tudo por provedor (telas ERP, WhatsApp e Chatwoot): cada provedor vê o SEU status.
    const erpProvider = (await this.erp.resolve(tenantId)).provider;
    const pulseIspEnabled = process.env.ISPAGENT_PULSEISP_ENABLED === 'true';
    const [wa, cw] = await Promise.all([
      this.prisma.whatsAppConnection.findUnique({ where: { tenantId } }),
      this.prisma.chatwootConnection.findUnique({ where: { tenantId }, select: { baseUrl: true } }),
    ]);

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
        status: erpProvider === 'demo' ? 'DEMONSTRAÇÃO (base de exemplo)' : 'SGP REAL — configurado na tela ERP',
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
        enabled: Boolean(wa),
        status: !wa ? 'NÃO CONFIGURADO — conecte na tela WhatsApp' : wa.provider === 'cloud' ? 'API OFICIAL (Meta)' : 'QR CODE (Evolution)',
      },
      chatwoot: {
        enabled: Boolean(cw),
        status: cw ? `CONECTADO — ${cw.baseUrl}` : 'NÃO CONFIGURADO — tela Chatwoot',
      },
      webchat: { enabled: true, status: 'VALIDADO — canal obrigatório do DEMO' },
    };
  }
}
