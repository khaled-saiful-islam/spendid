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

## Test accounts

`make up` seeds the admin. `make demo` adds normal people.

| Sign in with | Password | Who |
|---|---|---|
| `admin` | `admin` | Admin — manages accounts and the app, never sees spending (dev only; production refuses this password) |
| `maya` | `demo1234` | Normal person, set up, with this month's spending and two goals |
| `adam` | `demo1234` | Normal person, goes through onboarding on first sign-in |

New sign-ups get a confirmation email — open Mailpit at http://localhost:8604 to click it.

### Try Family Circle

maya and adam are already in each other's circle (spouses) and save into maya's "Bali trip" jar together.

1. Sign in as `maya` in one browser and `adam` in another (or a private window). Open **Family**.
2. As maya, open adam → **You share** → change the level or pause. adam's screen updates live; adam gets an email.
3. As maya, add an expense. It appears in adam's **Family pulse** within a second; adam can react 👏.
4. **Invite someone** makes a one-time link + QR (and an email if you add one). Open the link signed out:
   it asks you to sign up or sign in, then brings you back to join.
5. **Split a bill**: snap a bill or pick a recent receipt, drag each line onto a person (or tap it),
   then **Create split link**. The link opens without signing in.

## Commands

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop (data is kept) |
| `make logs s=api` | Follow logs for one service (`api`, `web`, `worker`, `db`) |
| `make install` | Reinstall after editing a `package.json` |
| `make demo` | Create the demo people above |
| `make db-generate` | New migration after editing `packages/db/src/schema` |
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
packages/db     Drizzle schema, migrations (applied by the `migrate` service on every `make up`)
packages/emails React Email templates + the email job contract
docker/         Dev image
```

## Rules worth knowing

- Money is stored as integer minor units + currency. Use `toMinor` / `formatMinor` from `@spendid/shared`.
- Admins manage accounts and AI limits. They can never read anyone's spending.
- Sharing between people always needs both sides to agree, and can be paused at any time.
  The "what they see" preview uses the same code as the other person's screen, so they can't differ.
