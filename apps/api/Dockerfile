# Build de apps/api (usado também pelo container ispagent-worker, com CMD diferente).
# Contexto de build = raiz do monorepo (necessário para o workspace pnpm resolver @ispagent/shared).

FROM node:20-alpine AS base
# Alpine 3.20+ (base do node:20-alpine) vem só com OpenSSL 3.x; sem o pacote `openssl` instalado, o
# runtime do Prisma não consegue detectar a versão de libssl disponível e assume "openssl-1.1.x" por
# padrão — errado neste caso — carregando o engine binário incompatível (P0.10 depende disto).
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
ENV ISPAGENT_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm --filter @ispagent/shared build
RUN pnpm --filter @ispagent/api exec prisma generate
RUN pnpm --filter @ispagent/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
EXPOSE 3001 3002
CMD ["node", "dist/main.js"]
