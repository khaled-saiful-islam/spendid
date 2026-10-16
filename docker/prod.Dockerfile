# Production images for Spendid. One build, three targets:
#   node  — api, worker and migrate (TypeScript run by tsx, same as dev, no bundler surprises)
#   web   — the built React app served by Caddy, which also proxies /api to the api
# Build: docker compose -f docker-compose.prod.yml build

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /app

# Install once from the lockfile, with only package manifests copied (good layer caching).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/emails/package.json packages/emails/
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --child-concurrency=2

FROM deps AS source
COPY . .

FROM source AS web-build
RUN pnpm --filter @spendid/web build

FROM caddy:2.10-alpine AS web
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv
EXPOSE 80 443

FROM source AS node
ENV NODE_ENV=production
RUN mkdir -p /data/receipts && chown -R node:node /data /app
USER node
# The service command comes from docker-compose.prod.yml (api, worker or migrate).
CMD ["pnpm", "--filter", "@spendid/api", "start"]
