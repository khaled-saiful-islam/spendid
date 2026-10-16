# Spendid

Know what you can safely spend today. Log spending by voice, photo or text, and share money life with
family — only with consent.

- Product + tech spec: [SPEC.md](SPEC.md)
- Build plan and status: [PLAN.md](PLAN.md)

## Run it

Needs Docker. Everything runs in containers with hot reload.

```bash
make up        # first run installs dependencies inside Docker (a few minutes)
```

| URL | What |
|---|---|
| http://localhost:8600 | Spendid web app |
| http://localhost:8601/api/health | API health (database + Redis) |
| http://localhost:8604 | Mailpit — every email the app sends in dev |

Postgres is on `localhost:8602`, Redis on `localhost:8603`.

## Commands

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop (data is kept) |
| `make logs s=api` | Follow logs for one service (`api`, `web`, `worker`, `db`) |
| `make install` | Reinstall after editing a `package.json` |
| `make test` | Unit + API tests |
| `make typecheck` | TypeScript 7 across all packages |
| `make check` / `make fix` | Biome lint + format |
| `make reset` | Delete all local data (asks first) |

## Layout

```
apps/api        Fastify 5 API (Better Auth, agent, routes)
apps/web        React 19 PWA (Vite, TanStack Router + Query, Tailwind 4, Motion)
apps/worker     BullMQ jobs (receipts, email, recap, reminders)
packages/shared Zod schemas, money math, shared types
docker/         Dev image
```

## Rules worth knowing

- Money is stored as integer minor units + currency. Use `toMinor` / `formatMinor` from `@spendid/shared`.
- Admins manage accounts and AI limits. They can never read anyone's spending.
- Sharing between people always needs both sides to agree, and can be paused at any time.
