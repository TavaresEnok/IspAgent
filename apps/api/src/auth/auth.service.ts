import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly jwt: JwtService,
  ) {}

  private get accessSecret() {
    return process.env.ISPAGENT_JWT_SECRET as string;
  }

  private get refreshSecret() {
    return process.env.ISPAGENT_JWT_REFRESH_SECRET as string;
  }

  private get accessTtl() {
    return process.env.ISPAGENT_JWT_ACCESS_TTL ?? '15m';
  }

  private get refreshTtl() {
    return process.env.ISPAGENT_JWT_REFRESH_TTL ?? '7d';
  }

  async login(email: string, password: string) {
    const user = await this.db.client.user.findFirst({ where: { email, active: true } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) throw new UnauthorizedException('Credenciais inválidas');

    return this.issueTokenPair({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
  }

  async refresh(refreshToken: string) {
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.db.client.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado ou revogado');
    }

    await this.db.client.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(payload);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.db.client.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(payload: AccessTokenPayload) {
    const accessToken = this.jwt.sign(payload, { secret: this.accessSecret, expiresIn: this.accessTtl });
    const refreshToken = this.jwt.sign({ ...payload, jti: randomUUID() }, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtl,
    });

    await this.db.client.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.parseTtlMs(this.refreshTtl)),
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
