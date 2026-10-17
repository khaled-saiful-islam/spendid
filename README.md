# Spendid

Know what you can safely spend today. Log spending by voice, photo or text, and share money life with
family — only with consent.

- Product + tech spec: [SPEC.md](SPEC.md)
- Build plan and status: [PLAN.md](PLAN.md)
- Feature docs (privacy, language, install, deploy, testing): [docs/](docs/README.md)

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

**On a phone (same Wi-Fi):** `make phone-url` prints this computer's address (e.g.
`http://192.168.100.88:8600`). Add it once to `.env` as `EXTRA_ORIGINS=…`, then
`docker compose restart api`, so sign-in accepts it. Over plain HTTP, phones block the
microphone, live camera and passkeys; typing, picking a photo or PDF, and everything else work.

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
| `make digests u=maya` | Send someone's weekly summary, bill, warranty and Wrapped emails now (normally scheduled) |
| `make db-generate` | New migration after editing `packages/db/src/schema` |
| `make test` | Unit + API tests |
| `make e2e` | Browser + accessibility tests at phone and desktop sizes (on your machine; needs `make up` + `make demo`) |
| `make phone-url` | The address to open Spendid on a phone on the same Wi-Fi |
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
e2e/            Playwright + axe browser tests (runs on the host)
docker/         Dev image, production image + Caddyfile
docs/           Feature docs
```

### Try insights and emails

- **Activity → Insights**: the month as a heatmap, subscriptions found from spending (maya has a Netflix price rise), and Money Wrapped (tap *Play the story*).
- **Ask Spendid**: tap one of your own numbers to ask about it.
- **Emails**: `make digests u=maya`, then open Mailpit. Every optional email has *Turn them off*; choose emails, hide amounts and quiet hours under **Me → Emails**. Emails that would land in quiet hours (default 10pm–8am) wait until they end.
- Add an expense bigger than 3× your usual for its category, or the same shop and amount twice in a day, to see the alerts.

### Try trust and polish

- **Hide amounts**: the eye button in the header blurs every number on screen.
- **Bahasa Melayu**: **Me → Language**. Saved to the profile, so it follows you; Ask Spendid answers in Malay too.
- **Your data**: **Me → Your data** → *Download my data* (zip with a spreadsheet, receipts and everything else;
  an email says when it's ready) or *Delete my account* (password + type DELETE).
- **Install**: in the production build Spendid installs to the home screen and opens offline. See [docs/pwa.md](docs/pwa.md).
- **Production**: [docs/deploy.md](docs/deploy.md) — one command with HTTPS by Caddy.

### Try the October round

- **Ask Spendid creates things**: "save 5000 for a laptop by June 2027", "put 50 into Bali trip",
  "cap eating out at 400", "should I buy headphones for 899?", "track Netflix 54.90 on the 5th",
  "lunch 12 and grab 9". Each shows a card; nothing is saved until you tap it.
  **Roast my month** / **Hype me up** for a playful take on your real numbers.
- **Chats**: saved to your account; the chats panel (desktop) or **Chats** button (phone) has search,
  day groups and one-tap delete with Undo. The battery shows AI questions left; tap it for details.
- **Voice**: talk as long as you like; each phrase is caught as you pause, then edit everything.
- **Subscriptions & bills** (Plan → Subscriptions, or the due-soon card on Home): add Netflix, Unifi,
  the gym…; due amounts are kept aside each month, a reminder email comes N days before, Mark paid logs it.
- **Home**: Pip (tap for the briefing and wardrobe; Pip grows as you log), streak shields,
  **Where your month is heading** with a what-if slider.
- **Plan → Challenges**: no-spend weekend, cook-at-home week and more, checked from your spending.
- **Insights → Where your money flowed**: income into needs, wants, savings and categories.
- **Receipts**: photos, screenshots or PDFs. Installed on Android, Spendid is in the share menu.
- **Onboarding** (Me → change style, or a new account): watch your pay sorted live, then the reveal.

## Rules worth knowing

- Money is stored as integer minor units + currency. Use `toMinor` / `formatMinor` from `@spendid/shared`.
- Admins manage accounts and AI limits. They can never read anyone's spending.
- Sharing between people always needs both sides to agree, and can be paused at any time.
  The "what they see" preview uses the same code as the other person's screen, so they can't differ.
