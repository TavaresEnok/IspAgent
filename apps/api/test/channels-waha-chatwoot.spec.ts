import { createHmac, randomUUID } from 'node:crypto';
import { WahaClient } from '../src/channels/waha.client';
import { WahaWebhookController } from '../src/channels/waha.controller';
import { WhatsAppCloudClient } from '../src/channels/whatsapp-cloud.client';
import { WhatsAppInboundService } from '../src/channels/whatsapp-inbound.service';
import { ChatwootClient, ChatwootWebhookController } from '../src/channels/chatwoot';
import { AiProviderResolverService } from '../src/integrations/ai/ai-provider-resolver.service';
import { runWithTenant } from '../src/common/tenant-context';
import { buildOrchestrator } from './helpers/build-orchestrator';

const TENANT = 'tnt_demo_alpha';
const WAHA_SECRET = 'segredo-webhook-waha-de-teste';
const CW_TOKEN = 'token-webhook-chatwoot-de-teste-com-32+chars';

/** Registra as chamadas HTTP de saída e responde 200. */
function recorder() {
  const calls: Array<{ url: string; method: string; body: any; headers: Record<string, string> }> = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('canais: WhatsApp por QR Code (WAHA) e Chatwoot (Agent Bot)', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  let inbound: WhatsAppInboundService;
  const saved = { ...process.env };
  const noAi = { resolve: async () => ({}) } as unknown as AiProviderResolverService;

  beforeAll(async () => {
    ctx = await buildOrchestrator();
  });

  beforeEach(() => {
    Object.assign(process.env, {
      ISPAGENT_WAHA_URL: 'http://waha.test',
      ISPAGENT_WAHA_API_KEY: 'chave-waha',
      ISPAGENT_WAHA_TENANT_ID: TENANT,
      ISPAGENT_WAHA_WEBHOOK_SECRET: WAHA_SECRET,
      ISPAGENT_CHATWOOT_URL: 'http://chatwoot.test',
      ISPAGENT_CHATWOOT_ACCOUNT_ID: '1',
      ISPAGENT_CHATWOOT_BOT_TOKEN: 'token-do-bot',
      ISPAGENT_CHATWOOT_TENANT_ID: TENANT,
      ISPAGENT_CHATWOOT_WEBHOOK_TOKEN: CW_TOKEN,
    });
    delete process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN;
    delete process.env.ISPAGENT_WHATSAPP_PHONE_NUMBER_ID;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  function waha() {
    const client = new WahaClient();
    const rec = recorder();
    client.fetchImpl = rec.impl;
    const cloud = new WhatsAppCloudClient(client);
    inbound = new WhatsAppInboundService(ctx.orchestrator, ctx.conversation, ctx.db, noAi, cloud);
    return { controller: new WahaWebhookController(client, ctx.prisma, inbound), calls: rec.calls, client };
  }

  const signed = (body: unknown) => {
    const rawBody = Buffer.from(JSON.stringify(body));
    return { req: { rawBody } as never, sig: createHmac('sha512', WAHA_SECRET).update(rawBody).digest('hex') };
  };

  const message = (from: string, text: string, extra: Record<string, unknown> = {}) => ({
    event: 'message',
    session: 'default',
    payload: { id: `wamid-${randomUUID()}`, from, fromMe: false, body: text, hasMedia: false, ...extra },
  });

  describe('WAHA', () => {
    it('recusa mensagem sem assinatura ou com assinatura errada', async () => {
      const { controller } = waha();
      const body = message('5511999990001@c.us', 'oi');
      await expect(controller.webhook({ rawBody: Buffer.from(JSON.stringify(body)) } as never, body, undefined)).rejects.toThrow(/Assinatura/);
      await expect(controller.webhook({ rawBody: Buffer.from(JSON.stringify(body)) } as never, body, 'a'.repeat(128))).rejects.toThrow(/Assinatura/);
    });

    it('mensagem assinada vira atendimento pelo WhatsApp e a resposta sai pelo WAHA para o mesmo número', async () => {
      const { controller, calls } = waha();
      const phone = `55119${Math.floor(10000000 + Math.random() * 89999999)}`;
      const body = message(`${phone}@c.us`, 'bom dia');
      const { req, sig } = signed(body);
      expect(await controller.webhook(req, body, sig)).toEqual({ status: 'received' });

      const sends = calls.filter((c) => c.url === 'http://waha.test/api/sendText');
      expect(sends.length).toBeGreaterThan(0);
      expect(sends[0].body.chatId).toBe(`${phone}@c.us`);
      expect(sends[0].headers['X-Api-Key']).toBe('chave-waha');
      const conv = await runWithTenant(TENANT, () =>
        ctx.db.client.conversation.findFirst({ where: { channel: 'WHATSAPP', channelUserId: phone } }),
      );
      expect(conv).not.toBeNull();
    });

    it('a mesma mensagem reenviada pelo WAHA não gera segunda resposta', async () => {
      const { controller, calls } = waha();
      const body = message(`5511988${Math.floor(100000 + Math.random() * 899999)}@c.us`, 'oi');
      const { req, sig } = signed(body);
      await controller.webhook(req, body, sig);
      const first = calls.length;
      expect(await controller.webhook(req, body, sig)).toEqual({ status: 'duplicate' });
      expect(calls.length).toBe(first);
    });

    it('mensagens próprias, de grupo e de outra sessão são ignoradas', async () => {
      const { controller, calls } = waha();
      for (const body of [
        message('5511999990001@c.us', 'eco', { fromMe: true }),
        message('120363000000000@g.us', 'grupo'),
        { ...message('5511999990001@c.us', 'x'), session: 'outra' },
      ]) {
        const { req, sig } = signed(body);
        expect(await controller.webhook(req, body, sig)).toEqual({ status: 'ignored' });
      }
      expect(calls.filter((c) => c.url.endsWith('/api/sendText'))).toHaveLength(0);
    });

    it('mídia só é baixada do próprio WAHA, pelo caminho /api/files (a chave nunca vai para outro host)', async () => {
      const { client, calls } = waha();
      await client.downloadMedia('http://outro-host.evil/api/files/default/a.ogg');
      expect(calls[0].url).toBe('http://waha.test/api/files/default/a.ogg');
      expect(await client.downloadMedia('http://waha.test/etc/passwd')).toBeNull();
      expect(await client.downloadMedia('http://waha.test/api/files/../../x')).toBeNull();
    });
  });

  describe('Chatwoot', () => {
    function chatwoot() {
      const client = new ChatwootClient();
      const rec = recorder();
      client.fetchImpl = rec.impl;
      const inb = new WhatsAppInboundService(ctx.orchestrator, ctx.conversation, ctx.db, noAi, new WhatsAppCloudClient());
      return {
        controller: new ChatwootWebhookController(ctx.prisma, ctx.db, ctx.conversation, ctx.orchestrator, inb, client),
        calls: rec.calls,
      };
    }

    const event = (convId: number, content: string, status = 'pending') => ({
      event: 'message_created',
      message_type: 'incoming',
      private: false,
      content,
      account: { id: 1 },
      conversation: { id: convId, status },
    });

    it('token errado no caminho = 404 (sem revelar que a rota existe)', async () => {
      const { controller } = chatwoot();
      await expect(controller.webhook('token-errado', event(1, 'oi'))).rejects.toThrow();
    });

    it('conversa já com atendente humano (open) é ignorada: o bot não fala por cima', async () => {
      const { controller, calls } = chatwoot();
      expect(await controller.webhook(CW_TOKEN, event(9001, 'oi', 'open'))).toEqual({ status: 'ignored' });
      expect(calls).toHaveLength(0);
    });

    it('responde na conversa do Chatwoot e, ao transferir, passa para a fila humana com o setor', async () => {
      const { controller, calls } = chatwoot();
      const convId = Math.floor(100000 + Math.random() * 800000);
      await controller.webhook(CW_TOKEN, event(convId, 'quero falar com um atendente'));

      const replies = calls.filter((c) => c.url === `http://chatwoot.test/api/v1/accounts/1/conversations/${convId}/messages`);
      expect(replies.length).toBeGreaterThan(0);
      expect(replies[0].headers.api_access_token).toBe('token-do-bot');
      expect(calls.some((c) => c.url.endsWith(`/conversations/${convId}/toggle_status`) && c.body.status === 'open')).toBe(true);
      expect(calls.some((c) => c.url.endsWith(`/conversations/${convId}/labels`) && c.body.labels[0] === 'suporte-tecnico')).toBe(true);
    });
  });
});
