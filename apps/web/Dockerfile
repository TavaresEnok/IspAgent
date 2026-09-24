# Contexto de build = raiz do monorepo.

FROM node:20-alpine AS base
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
COPY apps/web apps/web
RUN pnpm --filter @ispagent/shared build
ENV NEXT_TELEMETRY_DISABLED=1
# Variáveis NEXT_PUBLIC_* são gravadas no bundle do navegador NO BUILD (não em runtime): mudar a URL da
# API, o tenant do Web Chat ou a marca exige rebuild (docker compose build ispagent-web).
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_WEBCHAT_TENANT_ID=
ARG NEXT_PUBLIC_WEBCHAT_BRAND=
ARG NEXT_PUBLIC_DEMO_MODE=
# Sites que podem embutir o /webchat (widget.js), separados por espaço. Vazio = só a própria origem.
ARG ISPAGENT_WEBCHAT_FRAME_ANCESTORS=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WEBCHAT_TENANT_ID=$NEXT_PUBLIC_WEBCHAT_TENANT_ID \
    NEXT_PUBLIC_WEBCHAT_BRAND=$NEXT_PUBLIC_WEBCHAT_BRAND \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    ISPAGENT_WEBCHAT_FRAME_ANCESTORS=$ISPAGENT_WEBCHAT_FRAME_ANCESTORS
RUN pnpm --filter @ispagent/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
