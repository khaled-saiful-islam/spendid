#!/usr/bin/env bash
# Runs on the server (scripts/deploy.sh copies it next to the compose files):
# dump the database, then start the new images. Migrations run in the `migrate` service.
set -euo pipefail
cd "$(dirname "$0")"

args=()
for f in ${COMPOSE_FILES:-docker-compose.prod.yml}; do args+=(-f "$f"); done
compose=(docker compose "${args[@]}" --env-file .env.production)

if [ ! -s .env.production ]; then
  echo "server-up: missing .env.production in $(pwd) (see docs/deploy.md)" >&2
  exit 1
fi

mkdir -p backups
if [ -n "$("${compose[@]}" ps --status running --quiet db 2>/dev/null)" ]; then
  stamp="$(date +%Y%m%d-%H%M%S)"
  "${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' |
    gzip >"backups/db-$stamp.sql.gz"
  echo "server-up: database saved to backups/db-$stamp.sql.gz"
  # Keep the newest ten.
  ls -1t backups/db-*.sql.gz | tail -n +11 | xargs -r rm --
else
  echo "server-up: database not running yet (first deploy?), no backup"
fi

"${compose[@]}" up -d --no-build --wait --wait-timeout 300
"${compose[@]}" ps --format '{{.Service}}: {{.Status}}'
docker image prune -f >/dev/null
