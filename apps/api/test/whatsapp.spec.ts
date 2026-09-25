import { WhatsAppCloudClient } from '../src/channels/whatsapp-cloud.client';

describe('WhatsAppCloudClient', () => {
  const savedEnv = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...savedEnv };
  });

  function configure() {
    process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN = 'token-teste';
    process.env.ISPAGENT_WHATSAPP_PHONE_NUMBER_ID = '123456';
  }

  it('sem credenciais não finge envio: delivered=false e nenhuma chamada de rede', async () => {
    delete process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN;
    delete process.env.ISPAGENT_WHATSAPP_PHONE_NUMBER_ID;
    const res = await new WhatsAppCloudClient().sendText('5581999999999', 'oi');
    expect(res.delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com credenciais envia pela API de mensagens da Meta com o payload de texto', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }));

    const res = await new WhatsAppCloudClient().sendText('5581999999999', 'Olá!');

    expect(res).toEqual({ delivered: true, messageId: 'wamid.1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/123456/messages');
    expect(init.headers.Authorization).toBe('Bearer token-teste');
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '5581999999999',
      type: 'text',
      text: { body: 'Olá!' },
    });
  });

  it('erro da Meta vira delivered=false com o motivo, nunca "enviado"', async () => {
    configure();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 401 }));
    const res = await new WhatsAppCloudClient().sendText('5581999999999', 'oi');
    expect(res).toEqual({ delivered: false, reason: 'Meta HTTP 401: Invalid OAuth access token' });
  });

  it('baixa mídia pelo id (metadados → arquivo) e devolve base64', async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://lookaside.example/m1', mime_type: 'audio/ogg' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(Buffer.from('abc'), { status: 200 }));

    const media = await new WhatsAppCloudClient().downloadMedia('m1');

    expect(media).toEqual({ base64: Buffer.from('abc').toString('base64'), mimeType: 'audio/ogg' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v21.0/m1');
  });
});
