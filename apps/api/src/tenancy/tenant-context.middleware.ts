import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { runWithTenant } from '../common/tenant-context';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Extrai e valida o JWT de acesso (se presente) ANTES de guards/interceptors/handler, e executa o
 * resto da pipeline dentro de `runWithTenant(...)`. É isso que faz o AsyncLocalStorage carregar o
 * tenantId por toda a cadeia assíncrona da requisição, permitindo que a extensão do Prisma
 * (tenant-scoped.extension.ts) aplique o isolamento sem que cada service precise repassar tenantId
 * manualmente. Ausência/erro de token não bloqueia aqui — quem bloqueia é o JwtAuthGuard, para manter
 * rotas públicas (login, health) funcionando sem token.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    // Só o header: o stream SSE do painel usa ticket curto próprio (events.controller), nunca o JWT na URL.
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

    if (!token) {
      next();
      return;
    }

    try {
      const payload = this.jwt.verify(token, { secret: process.env.ISPAGENT_JWT_SECRET, algorithms: ['HS256'] });
      req.user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
      };
      runWithTenant(payload.tenantId, () => next());
    } catch {
      // token inválido/expirado: segue sem req.user; JwtAuthGuard bloqueia rotas protegidas.
      next();
    }
  }
}
