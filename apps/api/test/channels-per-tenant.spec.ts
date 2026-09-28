import { randomUUID } from 'node:crypto';
import { EvolutionClient } from '../src/channels/evolution.client';
import { WhatsAppChannelService, instanceNameFor } from '../src/channels/whatsapp-channel.service';
import { EvolutionWebhookController, evolutionSender } from '../src/channels/whatsapp-web.controller';
import { WhatsAppCloudClient } from '../src/channels/whatsapp-cloud.client';
import { WhatsAppInboundService } from '../src/channels/whatsapp-inbound.service';
import { ChatwootClient, ChatwootConnectionService, ChatwootWebhookController } from '../src/channels/chatwoot';
import { TenantAccessService } from '../src/platform/tenant-access.service';
import { AiProviderResolverService } from '../src/integrations/ai/ai-provider-resolver.service';
import { runWithTenant } from '../src/common/tenant-context';
import { buildOrchestrator } from './helpers/build-orchestrator';

const ALPHA = 'tnt_demo_alpha';
const BETA = 'tnt_demo_beta';

/** Registra as chamadas HTTP de saída e responde 200 (com o que a rota pedir). */
function recorder(routes: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; method: string; body: any; headers: Record<string, string> }> = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body as string) : undefined, headers: (init.headers ?? {}) as Record<string, string> });
    const hit = Object.entries(routes).find(([k]) => `${method} ${url}`.includes(k));
    return new Response(JSON.stringify(hit ? hit[1] : { key: { id: 'msg-1' } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('canais por provedor (SaaS): Evolution e Chatwoot', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  const saved = { ...process.env };
  const noAi = { resolve: async () => ({}) } as unknown as AiProviderResolverService;

  beforeAll(async () => {
    ctx = await buildOrchestrator();
  });

  beforeEach(() => {
    Object.assign(process.env, {
      ISPAGENT_EVOLUTION_URL: 'http://evolution.test',
      ISPAGENT_EVOLUTION_API_KEY: 'chave-global',
      ISPAGENT_EVOLUTION_WEBHOOK_BASE: 'http://api.test',
      ISPAGENT_PUBLIC_API_URL: 'http://api.publica.test',
    });
    for (const k of ['ISPAGENT_WHATSAPP_ACCESS_TOKEN', 'ISPAGENT_WHATSAPP_PHONE_NUMBER_ID', 'ISPAGENT_WHATSAPP_TENANT_ID']) delete process.env[k];
  });

  afterEach(async () => {
    process.env = { ...saved };
    await ctx.prisma.whatsAppConnection.deleteMany({ where: { tenantId: { in: [ALPHA, BETA] } } });
    await ctx.prisma.chatwootConnection.deleteMany({ where: { tenantId: { in: [ALPHA, BETA] } } });
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  function evolutionStack() {
    const evolution = new EvolutionClient();
    const rec = recorder({
      '/instance/fetchInstances': [],
      '/instance/connect/': { base64: 'data:image/png;base64,iVBORw0KGgo=' },
    });
    evolution.fetchImpl = rec.impl;
    const channels = new WhatsAppChannelService(ctx.prisma, evolution);
    const cloud = new WhatsAppCloudClient(channels);
    const inbound = new WhatsAppInboundService(ctx.orchestrator, ctx.conversation, ctx.db, noAi, cloud);
    const webhook = new EvolutionWebhookController(channels, inbound, new TenantAccessService(ctx.prisma));
    return { channels, cloud, webhook, calls: rec.calls };
  }

  const secretOf = (calls: Array<{ url: string; body: any }>) => {
    const create = calls.find((c) => c.url.endsWith('/instance/create'));
    return String(create?.body.webhook.url).split('/').pop() as string;
  };

  describe('Evolution (QR Code, uma instância por provedor)', () => {
    it('conectar cria a instância do provedor com webhook de segredo próprio e devolve o QR', async () => {
      const { channels, calls } = evolutionStack();
      const { qr } = await channels.connectEvolution(ALPHA);
      expect(qr).toMatch(/^data:image\/png;base64,/);
      const create = calls.find((c) => c.url.endsWith('/instance/create'))!;
      expect(create.body.instanceName).toBe(instanceNameFor(ALPHA));
      expect(create.body.webhook.url).toMatch(new RegExp(`^http://api.test/public/evolution/webhook/${instanceNameFor(ALPHA)}/[0-9a-f]{48}$`));
      expect(create.headers.apikey).toBe('chave-global');
      const row = await ctx.prisma.whatsAppConnection.findUniqueOrThrow({ where: { tenantId: ALPHA } });
      expect(row.webhookSecret).toMatch(/^enc:v1:/); // segredo cifrado no banco
    });

    it('webhook com segredo errado ou de outro provedor = 404', async () => {
      const { channels, webhook, calls } = evolutionStack();
      await channels.connectEvolution(ALPHA);
      const secret = secretOf(calls);
      await expect(webhook.webhook(instanceNameFor(ALPHA), 'f'.repeat(48), {})).rejects.toThrow();
      await expect(webhook.webhook(instanceNameFor(BETA), secret, {})).rejects.toThrow();
    });

    it('mensagem do cliente vira atendimento do provedor certo e a resposta sai pela instância dele', async () => {
      const { channels, webhook, calls } = evolutionStack();
      await channels.connectEvolution(ALPHA);
      const secret = secretOf(calls);
      const phone = `55119${Math.floor(10000000 + Math.random() * 89999999)}`;
      const res = await webhook.webhook(instanceNameFor(ALPHA), secret, {
        event: 'messages.upsert',
        data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: `id-${randomUUID()}` }, message: { conversation: 'bom dia' } },
      });
      expect(res).toEqual({ status: 'accepted' });
      await webhook.lastJob;
      const sends = calls.filter((c) => c.url.includes('/message/sendText/'));
      expect(sends.length).toBeGreaterThan(0);
      expect(sends[0].url).toBe(`http://evolution.test/message/sendText/${instanceNameFor(ALPHA)}`);
      expect(sends[0].body.number).toBe(phone);
      const conv = await runWithTenant(ALPHA, () => ctx.db.client.conversation.findFirst({ where: { channel: 'WHATSAPP', channelUserId: phone } }));
      expect(conv).not.toBeNull();
    });

    it('próprias mensagens, grupos e reenvios são ignorados', async () => {
      const { channels, webhook, calls } = evolutionStack();
      await channels.connectEvolution(ALPHA);
      const secret = secretOf(calls);
      const inst = instanceNameFor(ALPHA);
      expect(await webhook.webhook(inst, secret, { event: 'messages.upsert', data: { key: { remoteJid: '5511999990001@s.whatsapp.net', fromMe: true, id: 'a' } } })).toEqual({ status: 'ignored' });
      expect(await webhook.webhook(inst, secret, { event: 'messages.upsert', data: { key: { remoteJid: '120363@g.us', id: 'b' }, message: { conversation: 'oi' } } })).toEqual({ status: 'ignored' });
      const dup = { event: 'messages.upsert', data: { key: { remoteJid: '5511977770000@s.whatsapp.net', id: `dup-${randomUUID()}` }, message: { conversation: 'oi' } } };
      await webhook.webhook(inst, secret, dup);
      await webhook.lastJob;
      expect(await webhook.webhook(inst, secret, dup)).toEqual({ status: 'duplicate' });
    });

    it('contato anônimo (@lid) só é atendido quando o número real vem junto', () => {
      expect(evolutionSender({ remoteJid: '123@lid' })).toBeNull();
      expect(evolutionSender({ remoteJid: '123@lid', senderPn: '5581999990000@s.whatsapp.net' })).toBe('5581999990000');
      expect(evolutionSender({ remoteJid: '5581999990000@s.whatsapp.net' })).toBe('5581999990000');
    });

    it('envio usa o canal do provedor atual — outro provedor nunca sai pelo número dele', async () => {
      const { channels, cloud } = evolutionStack();
      await channels.connectEvolution(ALPHA);
      const beta = await runWithTenant(BETA, () => cloud.sendText('5511999990001', 'oi'));
      expect(beta.delivered).toBe(false);
    });

    it('API oficial: o mesmo número não pode ser de dois provedores; token fica cifrado', async () => {
      const { channels } = evolutionStack();
      const id = `${Date.now()}`;
      await channels.saveCloud(ALPHA, { phoneNumberId: id, accessToken: 'token-meta-alpha' });
      const row = await ctx.prisma.whatsAppConnection.findUniqueOrThrow({ where: { tenantId: ALPHA } });
      expect(row.accessToken).toMatch(/^enc:v1:/);
      await expect(channels.saveCloud(BETA, { phoneNumberId: id, accessToken: 'x' })).rejects.toThrow(/outro provedor/);
      expect(await channels.cloudByPhoneNumberId(id)).toEqual({ tenantId: ALPHA, token: 'token-meta-alpha' });
    });
  });

  describe('Chatwoot por provedor', () => {
    function chatwootStack() {
      const connections = new ChatwootConnectionService(ctx.prisma);
      const client = new ChatwootClient();
      const rec = recorder();
      client.fetchImpl = rec.impl;
      const inbound = new WhatsAppInboundService(ctx.orchestrator, ctx.conversation, ctx.db, noAi, new WhatsAppCloudClient());
      const webhook = new ChatwootWebhookController(
        ctx.db,
        ctx.conversation,
        ctx.orchestrator,
        inbound,
        client,
        connections,
        new TenantAccessService(ctx.prisma),
        ctx.prisma,
      );
      return { connections, webhook, calls: rec.calls };
    }

    const event = (convId: number, content: string, status = 'pending') => ({
      event: 'message_created',
      message_type: 'incoming',
      private: false,
      content,
      account: { id: 7 },
      conversation: { id: convId, status },
    });

    it('cada provedor ganha o próprio webhook (token secreto) e o token do bot fica cifrado', async () => {
      const { connections } = chatwootStack();
      const view = await connections.save(ALPHA, { baseUrl: 'http://chatwoot.test', accountId: '7', botToken: 'bot-alpha' });
      expect(view.webhookUrl).toMatch(/^http:\/\/api\.publica\.test\/public\/chatwoot\/webhook\/[0-9a-f]{64}$/);
      const row = await ctx.prisma.chatwootConnection.findUniqueOrThrow({ where: { tenantId: ALPHA } });
      expect(row.botToken).toMatch(/^enc:v1:/);
      expect(row.webhookTokenHash).not.toContain(view.webhookPath!.split('/').pop()!);
    });

    it('token desconhecido = 404; conversa com humano (open) é ignorada', async () => {
      const { connections, webhook, calls } = chatwootStack();
      const view = await connections.save(ALPHA, { baseUrl: 'http://chatwoot.test', accountId: '7', botToken: 'bot-alpha' });
      const token = view.webhookPath!.split('/').pop()!;
      await expect(webhook.webhook('0'.repeat(64), event(1, 'oi'))).rejects.toThrow();
      expect(await webhook.webhook(token, event(1, 'oi', 'open'))).toEqual({ status: 'ignored' });
      expect(calls).toHaveLength(0);
    });

    it('responde com o bot do provedor e transfere para a fila humana com o setor', async () => {
      const { connections, webhook, calls } = chatwootStack();
      const view = await connections.save(ALPHA, { baseUrl: 'http://chatwoot.test', accountId: '7', botToken: 'bot-alpha' });
      const token = view.webhookPath!.split('/').pop()!;
      const convId = Math.floor(100000 + Math.random() * 800000);
      expect(await webhook.webhook(token, event(convId, 'quero falar com um atendente'))).toEqual({ status: 'accepted' });
      await webhook.lastJob;
      const replies = calls.filter((c) => c.url === `http://chatwoot.test/api/v1/accounts/7/conversations/${convId}/messages`);
      expect(replies.length).toBeGreaterThan(0);
      expect(replies[0].headers.api_access_token).toBe('bot-alpha');
      expect(calls.some((c) => c.url.endsWith(`/conversations/${convId}/toggle_status`) && c.body.status === 'open')).toBe(true);
      expect(calls.some((c) => c.url.endsWith(`/conversations/${convId}/labels`) && c.body.labels[0] === 'suporte-tecnico')).toBe(true);
    });
  });
});
