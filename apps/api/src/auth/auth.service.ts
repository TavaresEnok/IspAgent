import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: string;
  email: string;
}

export const JWT_ALGORITHMS: ['HS256'] = ['HS256'];

/** Dois refreshes quase simultâneos (várias abas) não contam como roubo de token. */
const REUSE_GRACE_MS = 10_000;

// Hash descartável: compara a senha mesmo quando o e-mail não existe, para o tempo de resposta não
// revelar quais e-mails têm conta.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomUUID(), 10);
  return dummyHash;
}

/**
 * Login/refresh usam o `PrismaService` cru de propósito: nesse ponto ainda não há tenant conhecido
 * (é o login que o descobre). `RefreshToken` não tem `tenantId`; `User` só é lido aqui, por e-mail/id.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private get accessSecret() {
    return process.env.ISPAGENT_JWT_SECRET as string;
  }

  private get refreshSecret() {
    return process.env.ISPAGENT_JWT_REFRESH_SECRET as string;
  }

  // TTL vem do ambiente como texto ("15m", "7d"); o tipo do jsonwebtoken é um template literal estrito.
  private get accessTtl() {
    return (process.env.ISPAGENT_JWT_ACCESS_TTL ?? '15m') as NonNullable<JwtSignOptions['expiresIn']>;
  }

  private get refreshTtl() {
    return (process.env.ISPAGENT_JWT_REFRESH_TTL ?? '7d') as NonNullable<JwtSignOptions['expiresIn']>;
  }

  async login(email: string, password: string, tenantId?: string) {
    const candidates = await this.prisma.user.findMany({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
        active: true,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (candidates.length === 0) {
      await bcrypt.compare(password, await getDummyHash());
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const matches = [];
    for (const user of candidates) {
      if (await bcrypt.compare(password, user.passwordHash)) matches.push(user);
    }
    if (matches.length === 0) throw new UnauthorizedException('Credenciais inválidas');
    if (matches.length > 1) {
      throw new ConflictException({
        statusCode: 409,
        code: 'TENANT_REQUIRED',
        message: 'Este e-mail existe em mais de um provedor. Informe o provedor (tenant) para entrar.',
      });
    }

    const user = matches[0];
    return this.issueTokenPair({ sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
  }

  async refresh(refreshToken: string) {
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.refreshSecret, algorithms: JWT_ALGORITHMS });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash: this.hashToken(refreshToken) },
    });
    if (!stored) throw new UnauthorizedException('Refresh token inválido');

    if (stored.revokedAt) {
      // Token já usado sendo apresentado de novo: possível roubo. Derruba todas as sessões do usuário.
      if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        await this.revokeAllSessions(payload.sub);
      }
      throw new UnauthorizedException('Refresh token expirado ou revogado');
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado ou revogado');
    }

    // Papel/tenant/ativo vêm do banco, não do token antigo: desativar o usuário ou mudar o papel vale já
    // no próximo refresh.
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, active: true } });
    if (!user) {
      await this.revokeAllSessions(payload.sub);
      throw new UnauthorizedException('Usuário inativo ou removido');
    }

    // Rotação atômica: só uma requisição consegue consumir este token.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (consumed.count === 0) throw new UnauthorizedException('Refresh token expirado ou revogado');

    return this.issueTokenPair({ sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email });
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private revokeAllSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(payload: AccessTokenPayload) {
    // Só os claims de identidade: reaproveitar o payload de um token já verificado carregaria `exp`/`iat`
    // antigos e o `sign` recusaria (era o bug do refresh).
    const claims = { sub: payload.sub, tenantId: payload.tenantId, role: payload.role, email: payload.email };
    const accessToken = this.jwt.sign(claims, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
      algorithm: 'HS256',
    });
    const refreshToken = this.jwt.sign(
      { ...claims, jti: randomUUID() },
      { secret: this.refreshSecret, expiresIn: this.refreshTtl, algorithm: 'HS256' },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.parseTtlMs(String(this.refreshTtl))),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: payload.sub, tenantId: payload.tenantId, role: payload.role, email: payload.email },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * multipliers[unit];
  }
}
