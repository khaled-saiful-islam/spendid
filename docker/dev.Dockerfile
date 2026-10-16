# Dev image shared by api, worker and web. Source is bind-mounted; node_modules live in named volumes.
FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm \
    npm_config_store_dir=/pnpm-store \
    CI=true
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

WORKDIR /app
