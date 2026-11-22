# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/funbox?schema=public
ARG VITE_BOT_USERNAME=funbox_demo_bot
ARG VITE_DEMO_MODE=false
ENV VITE_BOT_USERNAME=$VITE_BOT_USERNAME
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
COPY . .
RUN pnpm --filter @funbox/api exec prisma generate
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=build /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=build /app/apps/bot/dist ./apps/bot/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/public ./apps/web/public
COPY scripts/docker-entrypoint.sh /usr/local/bin/funbox-entrypoint
RUN chmod +x /usr/local/bin/funbox-entrypoint \
    && mkdir -p /app/apps/api/uploads
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --start-period=25s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/funbox-entrypoint"]
