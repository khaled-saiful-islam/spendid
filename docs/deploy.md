# Deploy to a server

One Docker host runs everything: Postgres 18 + pgvector, Redis, the API, the worker, and Caddy
serving the built web app with automatic HTTPS.

## 1. Settings

```bash
cp .env.example .env.production
```

Change at least these. In production the API refuses to start with the placeholder secret or admin/admin.

| Setting | Set it to |
|---|---|
| `APP_URL` | `https://your-domain` (links in emails) |
| `SITE_ADDRESS` | `your-domain` — Caddy gets the HTTPS certificate |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| `SEED_ADMIN_PASSWORD` | A strong password (admin/admin is refused) |
| `POSTGRES_PASSWORD` + `DATABASE_URL` | A strong password, same in both |
| `RECEIPT_ENCRYPTION_KEY` | `openssl rand -base64 32` — keep a copy; without it receipts and exports can't be read |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Your email provider (587 STARTTLS or 465 TLS) |
| `ILMU_API_KEY` | Your ILMU key |

Point the domain's DNS A record at the server and open ports 80 and 443.

## 2. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` runs first (database migrations + the admin account), then `api`, `worker` and `web`
start. Check `https://your-domain/api/health`, and `docker compose -f docker-compose.prod.yml ps`
should show `api`, `worker` and `web` as `healthy` within a minute.

## 3. Update

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run again automatically; they only apply what's new.

## Notes

- Data lives in the `db_data`, `redis_data` and `receipts` volumes. Back up `db_data` and `receipts`
  together, and keep `RECEIPT_ENCRYPTION_KEY` with the backup.
- Without a domain, leave `SITE_ADDRESS=:80`. The app works over plain HTTP, but phones block the
  camera, microphone and passkeys until it's on HTTPS.
- Caddy sends security headers (HSTS, nosniff, camera/mic only for this site, no framing, and a
  Content-Security-Policy that allows no inline or third-party scripts) and never buffers `/api`
  live updates. If you add a third-party script or font, add its origin to the policy in
  `docker/Caddyfile`.
- Health checks: `api` asks `/api/health` (database and Redis); `worker` touches
  `/tmp/worker-alive` every 30 seconds while Redis answers; `web` serves the home page. Docker shows
  an unhealthy container but doesn't restart it; point your uptime monitor at `/api/health`.
- Receipt photos are files on one disk (the `receipts` volume), encrypted. That's fine for one
  server; before running more than one API, move them to object storage (S3 or compatible).
- Errors go to the container logs (`docker compose logs api worker`). No error-tracking service is
  wired in; add one (Sentry or similar) if you want alerts.
