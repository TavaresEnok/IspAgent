import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Segurança HTTP de ponta a ponta contra o app Nest completo (banco `_test`): cabeçalhos, CORS, RBAC com
 * tokens reais, isolamento de tenant, Web Chat público (DEMO e produção) e o fluxo de login/refresh.
 */
describe('segurança HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const jwt = new JwtService({});
  const ALPHA = 'tnt_demo_alpha';
  const BETA = 'tnt_demo_beta';

  const tokenFor = (role: string, tenantId = ALPHA) =>
    jwt.sign(
      { sub: `usr_test_${role}`, tenantId, role, email: `${role.toLowerCase()}@test.local` },
      { secret: process.env.ISPAGENT_JWT_SECRET, expiresIn: '5m' },
    );
  const auth = (role: string, tenantId = ALPHA) => ({ Authorization: `Bearer ${tokenFor(role, tenantId)}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('cabeçalhos e CORS', () => {
    it('não anuncia o framework e envia cabeçalhos de segurança (helmet)', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('CORS: origem hostil não recebe permissão; localhost (painel em dev) recebe', async () => {
      const evil = await request(app.getHttpServer()).get('/health').set('Origin', 'https://evil.example');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();

      const local = await request(app.getHttpServer()).get('/health').set('Origin', 'http://localhost:3010');
      expect(local.headers['access-control-allow-origin']).toBe('http://localhost:3010');
    });
  });

  describe('login e refresh', () => {
    it('REGRESSÃO: /auth/refresh devolve 200 e novo par; token de refresh é de uso único', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@alpha.ispagent.local', password: 'Demo!2026' })
        .expect(200);
      expect(login.body.accessToken).toBeTruthy();

      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(refreshed.body.accessToken).toBeTruthy();
      expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(200);
      expect(me.body.tenantId).toBe(ALPHA);
    });

    it('login com senha errada é 401 e sem body válido é 400', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin@alpha.ispagent.local', password: 'x' }).expect(401);
      await request(app.getHttpServer()).post('/auth/login').send({ email: 'não-é-email', password: 'x' }).expect(400);
    });
  });

  describe('RBAC', () => {
    it('sem token: 401', async () => {
      await request(app.getHttpServer()).get('/customers').expect(401);
    });

    it('READ_ONLY não acessa dado pessoal nem age em atendimento', async () => {
      const h = auth('READ_ONLY');
      await request(app.getHttpServer()).get('/customers').set(h).expect(403);
      await request(app.getHttpServer()).get('/conversations').set(h).expect(403);
      await request(app.getHttpServer()).post('/handoff/qualquer/assume').set(h).expect(403);
      await request(app.getHttpServer()).post('/conversations/qualquer/messages').set(h).send({ content: 'oi' }).expect(403);
      await request(app.getHttpServer()).post('/knowledge').set(h).send({ title: 't', content: 'c' }).expect(403);
      await request(app.getHttpServer()).get('/ai-config').set(h).expect(403);
      await request(app.getHttpServer()).get('/pulseisp/connection').set(h).expect(403);
    });

    it('ANALYST lê (com CPF mascarado) mas não age', async () => {
      const h = auth('ANALYST');
      const list = await request(app.getHttpServer()).get('/customers').set(h).expect(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      for (const c of list.body.items) expect(c.document).toMatch(/^[•.\-/\d]+$/);
      expect(list.body.items[0].document).toContain('•');

      await request(app.getHttpServer()).get('/handoff/queue').set(h).expect(200);
      await request(app.getHttpServer()).post('/handoff/qualquer/assume').set(h).expect(403);
    });

    it('AGENT atende (passa do guard) mas não escreve na KB nem lê auditoria', async () => {
      const h = auth('AGENT');
      await request(app.getHttpServer()).post('/handoff/inexistente/assume').set(h).expect(404); // passou do RBAC
      await request(app.getHttpServer()).post('/knowledge').set(h).send({ title: 't', content: 'c' }).expect(403);
      await request(app.getHttpServer()).get('/audit-logs').set(h).expect(403);
    });

    it('SUPERVISOR vê o CPF completo e escreve na KB (com limite de tamanho)', async () => {
      const h = auth('SUPERVISOR');
      const detail = await request(app.getHttpServer()).get('/customers/cus_demo_a').set(h).expect(200);
      expect(detail.body.document).toBe('111.111.111-01');

      const created = await request(app.getHttpServer())
        .post('/knowledge')
        .set(h)
        .send({ title: 'doc-de-teste-rbac', content: 'conteúdo' })
        .expect(201);
      await prisma.knowledgeDocument.delete({ where: { id: created.body.id } });

      await request(app.getHttpServer())
        .post('/knowledge')
        .set(h)
        .send({ title: 't', content: 'x'.repeat(20_001) })
        .expect(400);
    });

    it('isolamento de tenant via HTTP: staff do tenant Beta não enxerga cliente do Alpha', async () => {
      await request(app.getHttpServer()).get('/customers/cus_demo_a').set(auth('SUPERVISOR', BETA)).expect(404);
    });
  });

  describe('Web Chat público — modo DEMO', () => {
    const cleanup = async (channelUserId: string) => {
      await request(app.getHttpServer()).delete(`/public/webchat/${ALPHA}/conversation/${encodeURIComponent(channelUserId)}`);
    };

    it('as rotas que expunham/gravavam clientes do PulseISP sem login foram removidas', async () => {
      await request(app.getHttpServer()).get(`/public/webchat/${ALPHA}/pulse-customers?search=an`).expect(404);
      await request(app.getHttpServer()).post(`/public/webchat/${ALPHA}/pulse-simulate`).send({ customerId: 'x' }).expect(404);
    });

    it('mensagem normal funciona e o reset (DEMO) apaga a conversa', async () => {
      const phone = '+5511999990002';
      const sent = await request(app.getHttpServer())
        .post(`/public/webchat/${ALPHA}/message`)
        .send({ channelUserId: phone, message: 'Minha fatura está com atraso?' })
        .expect(201);
      expect(sent.body.messages.length).toBeGreaterThanOrEqual(2);
      expect(sent.body.sessionToken).toBeUndefined(); // token de sessão só existe em produção

      const reset = await request(app.getHttpServer())
        .delete(`/public/webchat/${ALPHA}/conversation/${encodeURIComponent(phone)}`)
        .expect(200);
      expect(reset.body.reset).toBe(true);
    });

    it('mensagem gigante, id de canal inválido e tenant inexistente são recusados', async () => {
      await request(app.getHttpServer())
        .post(`/public/webchat/${ALPHA}/message`)
        .send({ channelUserId: 'abc', message: 'x'.repeat(2001) })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/public/webchat/${ALPHA}/message`)
        .send({ channelUserId: 'com espaço', message: 'oi' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/public/webchat/tnt_nao_existe/message')
        .send({ channelUserId: 'abc', message: 'oi' })
        .expect(404);
    });

    it('GET de conversa inexistente NÃO cria conversa (leitura sem efeito colateral)', async () => {
      const id = `visitante-${Date.now()}`;
      const res = await request(app.getHttpServer()).get(`/public/webchat/${ALPHA}/conversation/${id}`).expect(200);
      expect(res.body).toEqual({ conversationId: null, status: null, messages: [] });
      expect(await prisma.conversation.count({ where: { channelUserId: id } })).toBe(0);
    });

    it('canal reservado `pulse:` (cliente real do PulseISP) só aceita login de ADMIN do MESMO tenant', async () => {
      const channelUserId = 'pulse:cliente-real-123';
      const url = `/public/webchat/${ALPHA}/message`;
      const body = { channelUserId, message: 'oi' };

      await request(app.getHttpServer()).post(url).send(body).expect(403); // anônimo
      await request(app.getHttpServer()).post(url).set(auth('AGENT')).send(body).expect(403); // papel baixo
      await request(app.getHttpServer()).post(url).set(auth('TENANT_ADMIN', BETA)).send(body).expect(403); // outro tenant
      await request(app.getHttpServer())
        .get(`/public/webchat/${ALPHA}/conversation/${encodeURIComponent(channelUserId)}`)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/public/webchat/${ALPHA}/conversation/${encodeURIComponent(channelUserId)}`)
        .expect(403);

      await request(app.getHttpServer()).post(url).set(auth('TENANT_ADMIN')).send(body).expect(201);
      await request(app.getHttpServer())
        .delete(`/public/webchat/${ALPHA}/conversation/${encodeURIComponent(channelUserId)}`)
        .set(auth('TENANT_ADMIN'))
        .expect(200);
    });

    it('o reset é auditado', async () => {
      const id = `audit-${Date.now()}`;
      await request(app.getHttpServer()).post(`/public/webchat/${ALPHA}/message`).send({ channelUserId: id, message: 'oi' });
      await cleanup(id);
      const logs = await prisma.auditLog.count({ where: { tenantId: ALPHA, action: 'webchat.conversation_reset' } });
      expect(logs).toBeGreaterThan(0);
    });
  });

  describe('Web Chat público — modo produção', () => {
    const original = { ...process.env };
    afterEach(() => {
      for (const key of ['ISPAGENT_ENV', 'ISPAGENT_WEBCHAT_PUBLIC_ENABLED', 'ISPAGENT_DEMO_ENDPOINTS']) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
    });

    it('desligado por padrão em produção (404)', async () => {
      process.env.ISPAGENT_ENV = 'production';
      await request(app.getHttpServer()).get('/public/webchat/config').expect(404);
      await request(app.getHttpServer())
        .post(`/public/webchat/${ALPHA}/message`)
        .send({ channelUserId: 'session-0123456789abcdef', message: 'oi' })
        .expect(404);
    });

    it('ligado explicitamente: exige id de sessão aleatório, emite token e o exige nas chamadas seguintes', async () => {
      process.env.ISPAGENT_ENV = 'production';
      process.env.ISPAGENT_WEBCHAT_PUBLIC_ENABLED = 'true';
      const session = `sess_${Date.now()}_abcdefghijkl`;
      const post = (token?: string) => {
        const r = request(app.getHttpServer()).post(`/public/webchat/${ALPHA}/message`);
        if (token) r.set('X-Webchat-Token', token);
        return r.send({ channelUserId: session, message: 'oi, tudo bem?' });
      };

      // telefone como id é recusado: não é um segredo de sessão
      await request(app.getHttpServer())
        .post(`/public/webchat/${ALPHA}/message`)
        .send({ channelUserId: '+5511999990002', message: 'oi' })
        .expect(403);

      const first = await post().expect(201);
      const token = first.body.sessionToken as string;
      expect(token).toBeTruthy();

      await post().expect(403); // conversa já existe: sem token não entra
      await post('token-errado').expect(403);
      await post(token).expect(201);

      const get = (t?: string) => {
        const r = request(app.getHttpServer()).get(`/public/webchat/${ALPHA}/conversation/${session}`);
        if (t) r.set('X-Webchat-Token', t);
        return r;
      };
      await get().expect(403);
      const history = await get(token).expect(200);
      expect(history.body.messages.length).toBeGreaterThan(0);

      // reset sem login em produção: 404 (rota DEMO desligada)
      await request(app.getHttpServer()).delete(`/public/webchat/${ALPHA}/conversation/${session}`).expect(404);
      // ...mas um supervisor logado consegue
      await request(app.getHttpServer())
        .delete(`/public/webchat/${ALPHA}/conversation/${session}`)
        .set(auth('SUPERVISOR'))
        .expect(200);
    });
  });
});
