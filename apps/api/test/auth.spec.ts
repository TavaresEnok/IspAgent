import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService — login, refresh e sessões', () => {
  let prisma: PrismaService;
  let jwt: JwtService;
  let auth: AuthService;

  const T_A = 'tnt_test_auth_a';
  const T_B = 'tnt_test_auth_b';
  const EMAIL = 'pessoa@auth-test.local';
  const PASSWORD = 'Senha-Forte-123';

  async function makeUser(id: string, tenantId: string, opts: { password?: string; role?: 'AGENT' | 'TENANT_ADMIN'; email?: string } = {}) {
    return prisma.user.create({
      data: {
        id,
        tenantId,
        email: opts.email ?? EMAIL,
        passwordHash: await bcrypt.hash(opts.password ?? PASSWORD, 4),
        role: opts.role ?? 'AGENT',
        name: id,
      },
    });
  }

  async function cleanup() {
    await prisma.refreshToken.deleteMany({ where: { user: { tenantId: { in: [T_A, T_B] } } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [T_A, T_B] } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    jwt = new JwtService({});
    auth = new AuthService(prisma, jwt);
    for (const id of [T_A, T_B]) await prisma.tenant.upsert({ where: { id }, update: {}, create: { id, name: id } });
  });

  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await prisma.tenant.deleteMany({ where: { id: { in: [T_A, T_B] } } });
    await prisma.$disconnect();
  });

  it('login válido devolve access + refresh token e o usuário', async () => {
    await makeUser('usr_auth_1', T_A);
    const session = await auth.login(EMAIL, PASSWORD);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user).toMatchObject({ id: 'usr_auth_1', tenantId: T_A, role: 'AGENT' });
  });

  it('senha errada e e-mail inexistente dão a mesma resposta 401', async () => {
    await makeUser('usr_auth_1', T_A);
    await expect(auth.login(EMAIL, 'errada')).rejects.toThrow(UnauthorizedException);
    await expect(auth.login('ninguem@auth-test.local', PASSWORD)).rejects.toThrow(UnauthorizedException);
  });

  it('e-mail é comparado sem diferenciar maiúsculas', async () => {
    await makeUser('usr_auth_1', T_A);
    await expect(auth.login(EMAIL.toUpperCase(), PASSWORD)).resolves.toBeTruthy();
  });

  it('usuário inativo não entra', async () => {
    const user = await makeUser('usr_auth_1', T_A);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    await expect(auth.login(EMAIL, PASSWORD)).rejects.toThrow(UnauthorizedException);
  });

  describe('mesmo e-mail em dois provedores', () => {
    it('senhas diferentes: cada uma entra no seu tenant, sem cair na conta errada', async () => {
      await makeUser('usr_auth_a', T_A, { password: 'Senha-do-A-111' });
      await makeUser('usr_auth_b', T_B, { password: 'Senha-do-B-222' });
      expect((await auth.login(EMAIL, 'Senha-do-A-111')).user.tenantId).toBe(T_A);
      expect((await auth.login(EMAIL, 'Senha-do-B-222')).user.tenantId).toBe(T_B);
    });

    it('mesma senha nos dois: exige o tenant (409) em vez de escolher um qualquer', async () => {
      await makeUser('usr_auth_a', T_A);
      await makeUser('usr_auth_b', T_B);
      await expect(auth.login(EMAIL, PASSWORD)).rejects.toThrow(ConflictException);
      expect((await auth.login(EMAIL, PASSWORD, T_B)).user.tenantId).toBe(T_B);
    });
  });

  describe('refresh', () => {
    it('REGRESSÃO: /auth/refresh funciona e devolve um novo par de tokens (antes lançava "payload already has exp")', async () => {
      await makeUser('usr_auth_1', T_A);
      const first = await auth.login(EMAIL, PASSWORD);
      const second = await auth.refresh(first.refreshToken);

      expect(second.accessToken).toBeTruthy();
      expect(second.refreshToken).not.toBe(first.refreshToken);
      const claims = jwt.verify(second.accessToken, { secret: process.env.ISPAGENT_JWT_SECRET });
      expect(claims).toMatchObject({ sub: 'usr_auth_1', tenantId: T_A, role: 'AGENT' });
    });

    it('o refresh token é de uso único (rotação): reapresentá-lo é recusado', async () => {
      await makeUser('usr_auth_1', T_A);
      const first = await auth.login(EMAIL, PASSWORD);
      await auth.refresh(first.refreshToken);
      await expect(auth.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('reuso tardio de um token já rotacionado (sinal de roubo) derruba TODAS as sessões do usuário', async () => {
      await makeUser('usr_auth_1', T_A);
      const first = await auth.login(EMAIL, PASSWORD);
      const second = await auth.refresh(first.refreshToken);
      // Envelhece a revogação para fora da janela de tolerância de abas simultâneas.
      await prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });

      await expect(auth.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(auth.refresh(second.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('usuário desativado depois do login não consegue renovar a sessão', async () => {
      const user = await makeUser('usr_auth_1', T_A);
      const session = await auth.login(EMAIL, PASSWORD);
      await prisma.user.update({ where: { id: user.id }, data: { active: false } });
      await expect(auth.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('o papel vem do banco: promoção/rebaixamento vale no próximo refresh', async () => {
      const user = await makeUser('usr_auth_1', T_A, { role: 'TENANT_ADMIN' });
      const session = await auth.login(EMAIL, PASSWORD);
      await prisma.user.update({ where: { id: user.id }, data: { role: 'AGENT' } });
      const renewed = await auth.refresh(session.refreshToken);
      expect(renewed.user.role).toBe('AGENT');
    });

    it('token adulterado, de outro segredo ou access token no lugar do refresh são recusados', async () => {
      await makeUser('usr_auth_1', T_A);
      const session = await auth.login(EMAIL, PASSWORD);
      await expect(auth.refresh(session.refreshToken + 'x')).rejects.toThrow(UnauthorizedException);
      await expect(auth.refresh(session.accessToken)).rejects.toThrow(UnauthorizedException);
      const forged = jwt.sign({ sub: 'usr_auth_1', tenantId: T_A, role: 'TENANT_ADMIN', email: EMAIL }, { secret: 'outro-segredo' });
      await expect(auth.refresh(forged)).rejects.toThrow(UnauthorizedException);
    });

    it('logout revoga o refresh token', async () => {
      await makeUser('usr_auth_1', T_A);
      const session = await auth.login(EMAIL, PASSWORD);
      await auth.logout(session.refreshToken);
      await expect(auth.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
