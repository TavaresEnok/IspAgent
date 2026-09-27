import { WahaClient, WahaError } from '../src/channels/waha.client';

/** WAHA falso: registra as chamadas e responde o que o teste mandar. */
function fakeWaha(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: Array<{ method: string; path: string; headers: Record<string, string>; body?: string }> = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace('http://waha.test', '');
    const method = init.method ?? 'GET';
    calls.push({ method, path, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    const route = routes[`${method} ${path}`] ?? { status: 404 };
    return new Response(route.body === undefined ? '' : JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('WAHA (WhatsApp por QR Code no painel)', () => {
  const env = { ...process.env };
  let client: WahaClient;

  beforeEach(() => {
    process.env.ISPAGENT_WAHA_URL = 'http://waha.test/';
    process.env.ISPAGENT_WAHA_API_KEY = 'chave-de-teste';
    process.env.ISPAGENT_WAHA_TENANT_ID = 'tnt_vibe';
    delete process.env.ISPAGENT_WAHA_SESSION;
    delete process.env.ISPAGENT_WAHA_WEBHOOK_URL;
    delete process.env.ISPAGENT_WAHA_WEBHOOK_SECRET;
    client = new WahaClient();
  });

  afterAll(() => {
    process.env = env;
  });

  it('só o tenant dono do número enxerga a conexão (outro provedor nunca mexe nela)', () => {
    expect(client.isAvailableFor('tnt_vibe')).toBe(true);
    expect(client.isAvailableFor('tnt_outro')).toBe(false);
    delete process.env.ISPAGENT_WAHA_API_KEY;
    expect(client.isAvailableFor('tnt_vibe')).toBe(false);
  });

  it('status: sessão inexistente vira "nunca conectado"; conectada traz o número', async () => {
    const none = fakeWaha({});
    client.fetchImpl = none.impl;
    expect(await client.status()).toEqual({ status: null, phone: null, pushName: null });

    const working = fakeWaha({
      'GET /api/sessions/default': { status: 200, body: { status: 'WORKING', me: { id: '5581999990000@c.us', pushName: 'Vibe' } } },
    });
    client.fetchImpl = working.impl;
    expect(await client.status()).toEqual({ status: 'WORKING', phone: '5581999990000', pushName: 'Vibe' });
    expect(working.calls[0].headers['X-Api-Key']).toBe('chave-de-teste');
  });

  it('conectar cria a sessão na primeira vez e só reinicia depois', async () => {
    const first = fakeWaha({ 'POST /api/sessions': { status: 201, body: { name: 'default' } } });
    client.fetchImpl = first.impl;
    await client.start();
    expect(first.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/sessions/default', 'POST /api/sessions']);
    expect(JSON.parse(first.calls[1].body as string)).toEqual({ name: 'default', start: true });

    const stopped = fakeWaha({
      'GET /api/sessions/default': { status: 200, body: { status: 'STOPPED' } },
      'POST /api/sessions/default/start': { status: 201, body: {} },
    });
    client.fetchImpl = stopped.impl;
    await client.start();
    expect(stopped.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/sessions/default', 'POST /api/sessions/default/start']);

    const running = fakeWaha({ 'GET /api/sessions/default': { status: 200, body: { status: 'SCAN_QR_CODE' } } });
    client.fetchImpl = running.impl;
    await client.start();
    expect(running.calls).toHaveLength(1); // já está rodando: não reinicia (não invalida o QR na tela)
  });

  it('com o webhook configurado, a sessão nasce (ou é atualizada) mandando as mensagens assinadas ao ISPAgent', async () => {
    process.env.ISPAGENT_WAHA_WEBHOOK_URL = 'http://api.test/public/waha/webhook';
    process.env.ISPAGENT_WAHA_WEBHOOK_SECRET = 'segredo';
    const first = fakeWaha({ 'POST /api/sessions': { status: 201, body: {} } });
    client.fetchImpl = first.impl;
    await client.start();
    const created = JSON.parse(first.calls[1].body as string);
    expect(created.config.webhooks[0]).toMatchObject({ url: 'http://api.test/public/waha/webhook', events: ['message'], hmac: { key: 'segredo' } });

    const existing = fakeWaha({
      'GET /api/sessions/default': { status: 200, body: { status: 'SCAN_QR_CODE' } },
      'PUT /api/sessions/default': { status: 200, body: {} },
    });
    client.fetchImpl = existing.impl;
    await client.start();
    expect(existing.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/sessions/default', 'PUT /api/sessions/default']);
  });

  it('QR Code volta como imagem base64', async () => {
    const f = fakeWaha({ 'GET /api/default/auth/qr?format=image': { status: 200, body: { mimetype: 'image/png', data: 'iVBORw0KGgo=' } } });
    client.fetchImpl = f.impl;
    expect(await client.qr()).toEqual({ mimetype: 'image/png', data: 'iVBORw0KGgo=' });
    expect(f.calls[0].headers.Accept).toBe('application/json');
  });

  it('desconectar faz logout e para a sessão', async () => {
    const f = fakeWaha({
      'POST /api/sessions/default/logout': { status: 201, body: {} },
      'POST /api/sessions/default/stop': { status: 201, body: {} },
    });
    client.fetchImpl = f.impl;
    await client.logout();
    expect(f.calls.map((c) => c.path)).toEqual(['/api/sessions/default/logout', '/api/sessions/default/stop']);
  });

  it('chave recusada e WAHA fora do ar viram erro claro (sem vazar a chave)', async () => {
    client.fetchImpl = fakeWaha({ 'GET /api/sessions/default': { status: 401 } }).impl;
    await expect(client.status()).rejects.toThrow(/recusou a chave/);

    client.fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const err = await client.status().catch((e) => e);
    expect(err).toBeInstanceOf(WahaError);
    expect(String(err.message)).not.toContain('chave-de-teste');
  });
});
