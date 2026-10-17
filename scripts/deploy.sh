#!/usr/bin/env bash
# Deploy Spendid: build the images on this computer for the server's chip, copy them over
# SSH, then back up, migrate and start on the server. Run from the repo root: make deploy
#
# Settings come from .env.deploy (see .env.deploy.example). The server keeps its own
# .env.production (and .env.tunnel); secrets never leave it.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.deploy ]; then
  echo "deploy: missing .env.deploy (copy .env.deploy.example and fill it in)" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env.deploy
: "${DEPLOY_HOST:?set DEPLOY_HOST in .env.deploy}" "${DEPLOY_KEY:?set DEPLOY_KEY in .env.deploy}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/spendid}"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"
DEPLOY_COMPOSE="${DEPLOY_COMPOSE:-docker-compose.prod.yml}"

remote() { ssh -i "$DEPLOY_KEY" -o BatchMode=yes "$DEPLOY_HOST" "$@"; }

echo "1/4 Building images for $DEPLOY_PLATFORM (the server's chip)"
for target in node web; do
  docker buildx build --platform "$DEPLOY_PLATFORM" -f docker/prod.Dockerfile \
    --target "$target" -t "spendid-$target:latest" --load .
done

echo "2/4 Copying images to the server (a few minutes on home internet)"
docker save spendid-node:latest spendid-web:latest | gzip -1 | remote "gunzip | docker load"

echo "3/4 Copying compose files"
remote "mkdir -p '$DEPLOY_DIR'"
# shellcheck disable=SC2086
scp -i "$DEPLOY_KEY" -o BatchMode=yes $DEPLOY_COMPOSE scripts/server-up.sh "$DEPLOY_HOST:$DEPLOY_DIR/"

echo "4/4 Backing up, migrating and starting"
remote "cd '$DEPLOY_DIR' && COMPOSE_FILES='$DEPLOY_COMPOSE' bash server-up.sh"
