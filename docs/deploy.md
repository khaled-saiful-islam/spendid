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
start. Check `https://your-domain/api/health`.

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
- Caddy sends security headers (HSTS, nosniff, camera/mic only for this site) and never buffers
  `/api` live updates.
