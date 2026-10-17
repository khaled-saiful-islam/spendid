# Deploy to a server

One Docker host runs everything: Postgres 18 + pgvector, Redis, the API, the worker, and Caddy
serving the built web app with automatic HTTPS.

Two ways to run it:

- **A server of its own** (sections 1–3 below): Caddy owns ports 80 and 443 and gets the
  certificate itself.
- **Next to another site** that already uses 80/443: no ports at all, Cloudflare Tunnel
  instead. See [Next to another site](#next-to-another-site-cloudflare-tunnel). This is how
  `https://spendid.mentora.stream` runs, beside Mentora on the same server.

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
| `CLIENT_IP_HEADER` | `cf-connecting-ip` only when every request comes through Cloudflare (the tunnel setup below, or a firewall open to Cloudflare alone); otherwise leave `x-forwarded-for` |

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

## Next to another site (Cloudflare Tunnel)

Used when another app on the server already answers on ports 80/443 (for Spendid: Mentora's
nginx). Spendid opens no ports. A small `cloudflared` container connects *out* to Cloudflare,
and Cloudflare sends `https://<host>` down that connection to Spendid's web container. The
other site's files, containers and firewall don't change.

```
Phone → Cloudflare (HTTPS) → tunnel → spendid web (Caddy) → api / worker → db / redis
```

### One-time setup

1. **Cloudflare tunnel.** Zero Trust → Networks → Tunnels → *Create a tunnel* (Cloudflared),
   name it `spendid`. Add a public hostname: `spendid.<your-domain>` → service
   `http://web:80`. Cloudflare adds the DNS record. Copy the tunnel token.
2. **Server folder.** `sudo mkdir -p /opt/spendid && sudo chown $USER /opt/spendid`, then put two
   files there (both `chmod 600`):
   - `.env.production`: as in section 1, plus `APP_URL=https://spendid.<your-domain>`,
     `SITE_ADDRESS=:80` and `CLIENT_IP_HEADER=cf-connecting-ip`.
   - `.env.tunnel`: `TUNNEL_TOKEN=<the token>`.
3. **This computer.** `cp .env.deploy.example .env.deploy` and fill in the server's SSH
   address and key. Keep `DEPLOY_COMPOSE` with `docker-compose.tunnel.yml`.

### Deploy (first time and every update)

```bash
make deploy
```

It builds the images here for the server's chip (most servers are `linux/amd64`; a Mac is
ARM, so Docker emulates), copies them over SSH, saves a database backup on the server
(`/opt/spendid/backups`, newest ten kept), runs migrations and starts everything. Building
on the server is avoided on purpose: a 2 GB server doesn't have the memory to build the web app.

### Memory

Each container has a cap (`mem_limit` in `docker-compose.prod.yml`), about 1.2 GB in all, so
Spendid can never push the other site out of memory. Check with
`docker stats --no-stream`. If Spendid sits near its caps, give the server more memory.

### Useful commands (on the server, in /opt/spendid)

```bash
c="docker compose -f docker-compose.prod.yml -f docker-compose.tunnel.yml --env-file .env.production"
$c ps                      # status
$c logs -f api worker      # logs
$c restart api             # restart one service
$c down                    # stop Spendid (data is kept in volumes)
```

