# Spendid — Product & Technical Spec

> Status: approved 2026-10-16. Source idea: `~/projects/app-ideas/spending-app-idea.pdf` (feature IDs SP-xx).
> Name: **Spendid** (spend + splendid). Web first (installable PWA), mobile later via Capacitor.

## 1. Pitch

A world-class spending app for anyone, anywhere. Log spending with almost no typing (voice, photo, chat) and
always know one number: **Safe to spend today**. Share money life with family — only with consent.

## 2. Users and roles

| Role | Can | Can never |
|---|---|---|
| **User** | Everything in §4 for their own money, plus what others share with them | See anyone's data without that person's consent |
| **Admin** | Manage the app and accounts: list users (name, email, status, joined, last active), ban / unban / delete, set per-user AI token limits, AI kill switch (per user or global), token **counts** per user/feature, app-wide totals, email delivery stats, app settings and models, admin audit log | See spending, receipts, budgets, goals, chats, voice, email content or family links. No impersonation |

Seeded admin: `admin` / `admin` (dev only; prod refuses insecure defaults).

## 3. Product rules (must / never)

1. **Admin never sees user financial data.** Enforced in code: admin routes have no path to money tables.
2. **Sharing is two-way consent.** Both people accept a connection. The shared person always sees exactly what
   others can view, and can pause or stop at any time. No hidden tracking.
3. Capture must take seconds. If logging feels like work, the feature is not done.
4. One clear number beats many charts. *Safe to spend today* is always on the home screen.
5. Alerts only when they matter.
6. Users own their data: full export and full delete at any time. Data is never sold.
7. Email is **send-only**. No inbox, no forwarding (SP-03 dropped).
8. AI calls never carry another user's data unless that user granted it.

## 4. v1 features

### Capture
- **SP-02 Voice** — tap and talk; auto-stop on silence; live waveform; ILMU ASR → agent → draft cards.
  **One-breath logging**: "Grab 15, coffee 6, and 40 for Sam's dinner split half" → 3 cards.
- **SP-01 Receipt camera** — live edge detection, steady auto-capture, crop + deskew, multi-receipt, gallery/PDF
  upload → ILMU vision → merchant, line items, tax, category.
- **Chat entry** and **manual entry** (fast form with smart defaults).

### Understand
- **SP-07 Smart categories** (learns from corrections), **SP-08 Clean merchant names** (pgvector aliases).
- **SP-09 Ask your money** — chat with charts, read-only tools scoped to the user + granted shares.
- **SP-10 Subscription detector** — recurring charges, price rises, trials ending.
- **SP-11 Spending heatmap**.
- **SP-12 Money Wrapped** — swipeable monthly story + shareable card (amounts can be hidden).
- ✨ **Price memory** — line items remembered: "Your latte is up 12% since March."
- ✨ **Warranty vault** — gadget receipts saved with warranty end + reminder.

### Plan
- **SP-13 Safe to spend today** — `(income − bills − savings goals − spent) ÷ days left`, shown as a living orb.
- **SP-14 Budgets** — envelope, zero-based or 50/30/20.
- **SP-16 Savings goals** (no round-ups in v1).
- ✨ **Impulse pause** (SP-19) — wishlist with a 48-hour cooldown and "hours of work" cost.

### Family Circle
- **Connections** by link or QR with a relation (spouse, partner, parent, child, sibling, other).
- **Share levels** per person: *totals* → *categories* → *transactions* → *transactions + receipts*; pause / stop.
- ✨ **Family pulse** — live feed with 👏 reactions; **shared goal jars** that fill with liquid.
- ✨ **Photo bill splitter** (SP-23) — drag receipt items onto people, send a split link.

### Delight
- ✨ **Pip the pangolin** — animated buddy with coin scales; shines when under budget, curls up when overspent.
- ✨ **Streaks** (SP-20) and a 10-second **nightly check-in** ("Anything I missed today?").

### Trust and baseline
- **SP-28** home currency + travel currencies (daily FX). **SP-29** English + Bahasa Melayu (i18n-ready).
- **SP-30** privacy first, receipts and notes encrypted at rest. **SP-31** passkey app lock + hide balances.
- **SP-33** full export (JSON + CSV + receipt images) and full delete.

### Emails (send-only)
| Group | Emails |
|---|---|
| Account | Verify email, password reset, new-device sign-in, passkey added, export ready, account deleted |
| Family | Invite (also to non-users), invite accepted, someone changed / paused what they share with you |
| Money | Weekly summary, budget 80%, unusual / duplicate charge, bill due, trial ending / price rise, warranty expiring, goal reached |
| Monthly | Money Wrapped |
| Admin | Account banned / restored, AI limit reached, announcements (never user data) |

Per-type on/off, digest frequency, quiet hours, one-click unsubscribe, "hide amounts in emails".
Security emails cannot be turned off. Admin sees delivery counts only.

### Admin console
Users, account actions, AI limits + kill switch, **AI cockpit** (live token burn, cost, per-feature counts),
email delivery stats, app settings, audit log.

## 5. Look and feel

- **Professional, never boring.** Vivid, confident, alive.
- Mobile-first. Phone: bottom tab bar with a glowing centre **+** (🎤 Voice · 📷 Scan · ⌨️ Type). Desktop: sidebar.
- Dark ink / warm cream themes; a vivid gradient + icon per category; glass cards; big tabular numbers.
- Fonts: **Bricolage Grotesque** (display + numbers), **Figtree** (UI).
- Palette: plum (brand ink), marigold (coin, primary action), jade (safe), coral (over). Light bg is a cool lilac paper, not cream.
- Motif: overlapping pangolin scales (`.bg-scales`) — Pip's texture.
- Motion: springs, count-up numbers, shared-element morphs, liquid goal jars, confetti, Pip reactions.
  Respects `prefers-reduced-motion`.
- Quality bar: 390 / 768 / 1280 px, light + dark, WCAG 2.2 AA, no truncated or overlapping text.

## 6. Stack (locked)

| Layer | Choice |
|---|---|
| Backend | Node 24 LTS, Fastify 5, TypeScript |
| Data | Postgres 18 + Drizzle ORM (+ pgvector), Redis 8 |
| Jobs | BullMQ worker |
| Auth | Better Auth (email + password, passkeys, admin plugin with impersonation disabled) |
| AI | LangChain.js v1 + LangGraph; ILMU for all models: `ilmu-v3.1` text, ILMU vision, `ilmu-asr-v4.2` speech |
| Frontend | React 19 + React Compiler, Vite, TanStack Router + Query, Tailwind 4, shadcn/ui, Motion |
| Shared | Zod 4 schemas, money math, types — `packages/shared` |
| Email | React Email templates, nodemailer SMTP, Mailpit in dev |
| Tooling | pnpm workspaces, Biome, Vitest, Playwright + axe, Docker Compose + make |
| Later | Capacitor (iOS / Android), Langfuse (counts only, never content) |

## 7. Architecture

```
apps/web      React PWA ──typed API (Zod)──▶ apps/api   Fastify + Better Auth + agent
apps/worker   BullMQ: receipts, email, subscriptions, recap, reminders
packages/shared  Zod schemas · money · types · email templates
Postgres 18 (+pgvector) · Redis 8 · ILMU · receipt files on a volume (Storage interface, S3 later)
```

| Port | Service | Container |
|---|---|---|
| 8600 | Web (Vite dev / static prod) | `spendid-web` |
| 8601 | API | `spendid-api` |
| 8602 | Postgres | `spendid-db` |
| 8603 | Redis | `spendid-redis` |
| 8604 | Mailpit UI (dev) | `spendid-mail` |
| — | Worker | `spendid-worker` |

## 8. Data model (main tables)

- **Accounts**: `user`, `session`, `account`, `passkey` (Better Auth), `profile` (home currency, locale,
  income, budget method, timezone).
- **Money**: `category`, `merchant` (+ aliases, embedding), `transaction`, `transaction_item`, `receipt`,
  `budget`, `goal`, `goal_member`, `fx_rate`.
- **Family**: `connection` (requester, addressee, relation, status), `share_grant` (owner → viewer, level, paused).
- **Features**: `split`, `split_share`, `subscription`, `warranty`, `wish`, `streak`, `feed_event`, `reaction`.
- **System**: `ai_usage` (user, feature, model, tokens in/out, cost — no content), `ai_limit`, `email_log`
  (type, status — no body), `email_pref`, `audit_log`, `app_setting`.
- **Money rule**: amounts are integer minor units (`bigint`) + ISO currency; each transaction also stores the
  home-currency amount and the FX rate used. Never floats.

## 9. AI flows

- **Voice**: Silero VAD (browser) → 16 kHz mono WAV → `POST /capture/voice` → ILMU ASR → agent with tools
  (`draft_expenses`, `find_person`, `convert_currency`) → draft cards → one tap saves.
- **Photo**: OpenCV.js worker (edges, auto-capture, crop) → upload → BullMQ job → ILMU vision with a Zod schema
  → draft with line items → pushed live (SSE).
- **Ask your money**: agent with read-only tools (`query_spending`, `make_chart`, `get_budget`), scoped server-side.
- **Token guard**: LangChain middleware checks the user's budget in Redis before every model call, records usage
  after. Over the limit → friendly message; admin is told via the cockpit.
- Tests use a fake ILMU provider — zero tokens.

## 10. Security

Better Auth httpOnly cookies, same-site + origin checks, rate limits, Zod at every boundary, every query scoped
by user id, share grants checked server-side, AES-GCM for receipts and notes, admin audit log, no secrets in git.

## 11. Testing

Vitest unit (money, safe-to-spend, parsers) + API integration against a test DB; Playwright + axe E2E at 390 and
1280 px. Target 80% coverage on `packages/shared` and `apps/api`.
