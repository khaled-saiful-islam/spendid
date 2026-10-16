# Spendid — Build Plan

Spec: [SPEC.md](SPEC.md). Build one milestone at a time. Each milestone ends with:
a URL to try, a short "how to test" list, docs updated, and a **local commit** (no push until told).

Dev: `make up` → web http://localhost:8600 · API http://localhost:8601 · Mailpit http://localhost:8604

| # | Milestone | Status |
|---|---|---|
| M0 | Scaffold + design system + app shell + animated welcome | ✅ |
| M1 | Auth, roles, emails (verify / reset), onboarding, passkey lock | ✅ |
| M2 | Money core + Safe-to-spend orb + budgets + goals | ✅ |
| M3 | Voice capture + one-breath logging | ✅ |
| M4 | Receipt camera + line items + price memory + warranty vault | ✅ |
| M5 | AI layer: agent, ask-your-money, token guard | ✅ |
| M6 | Admin console + AI cockpit | ✅ |
| M7 | Family Circle: connections, sharing, pulse, goal jars, bill split | ✅ |
| M8 | Insights + all notification emails + Money Wrapped | ✅ |
| M9 | Delight: Pip, streaks, nightly check-in, impulse pause | ✅ |
| M10 | Trust + polish: export / delete, hide balances, BM, PWA, E2E, phone audit, docs | ⏳ |

---

## M0 — Scaffold and first look
- pnpm workspace: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`; Biome; TS strict.
- Docker Compose dev stack with hot reload; `Makefile` (`up`, `down`, `logs`, `ps`, `sh-api`, `test`, `check`).
- API: Fastify 5, `/health` (DB + Redis), pino logs, Zod env config.
- Web: Vite + React 19 (Compiler) + Tailwind 4 + TanStack Router/Query + Motion.
- Design system: tokens (light / dark), fonts, category gradients, glass card, button, number display.
- App shell: phone bottom bar with glowing **+**, desktop sidebar, theme toggle.
- Animated welcome page with a live API status chip.
- **Test**: open :8600 at phone and desktop width, toggle theme, see "API online".

## M1 — Accounts
- Better Auth (email + password, admin plugin, impersonation off), Drizzle schema + migrations.
- Seed `admin` / `admin`; demo people `maya` (set up) and `adam` (new) / `demo1234` via `make demo`.
- Admin role has no impersonate / set-password / set-email — admins can't take over accounts.
- Sign-up, sign-in, sign-out, forgot / reset password, verify email (Mailpit).
- Email pipeline: React Email templates → BullMQ → nodemailer; `email_log`.
- Onboarding: home currency, monthly income, budget method, language.
- Passkey app lock (WebAuthn).
- **Test**: sign up → email arrives at :8604 → verify → onboarding → home.

## M2 — Money core
- Categories (seeded, gradients + icons), transactions (manual add / edit / delete / undo), list with filters.
- Money math in `packages/shared` (minor units, FX conversion) with unit tests.
- FX rates daily job; travel currency entry.
- **Safe-to-spend orb** on home; budgets (envelope / zero-based / 50-30-20); savings goals.
- **Test**: add expenses in two currencies, watch the orb change, set a budget, create a goal.
- Formula (`packages/shared/src/safe-to-spend.ts`): (income − savings kept aside − spent before today) ÷ days left, minus today's spending. 50/30/20 keeps max(20% of income, what goals need) aside.
- Exchange rates: ECB via Frankfurter, refreshed by the worker every 6 hours (29 currencies; others must be logged in the home currency).

## M3 — Voice
- Port Mentora `useRecorder` + `wav` (16 kHz) + speech provider to TS; add Silero VAD.
- Full-screen listening sheet: live waveform, captions, auto-stop.
- ILMU ASR → parser → multiple draft cards → one-tap save / edit.
- **Test**: "Grab 15, coffee 6, and 40 for dinner" → 3 cards.
- Done: AI usage ledger (`ai_usage`, counts only) + per-person allowance (`ai_limit`, default `AI_MONTHLY_TOKENS_DEFAULT`) pulled forward from M5; audio billed at 25 tokens/second.
- Measured: ~0.5 s listening + ~2.5 s understanding (ilmu-v3.1); hedged second request after 2.5 s, offline read after 9 s.

## M4 — Receipt camera
- OpenCV.js in a Web Worker: edge overlay, steady auto-capture, crop + deskew; gallery / PDF upload.
- Upload → BullMQ → ILMU vision (Zod schema) → draft with line items; SSE live status.
- Encrypted receipt storage; `transaction_item`; **price memory**; **warranty vault**.
- **Test**: scan a receipt → watch it read → save → see items and any warranty.
- Done: OpenCV.js 5 in a classic worker (`apps/web/workers/scanner.worker.js`, served at `/cv/*` with the VAD files by `vite-plugins/local-assets.ts`), auto-capture after ~1 s steady, perspective flatten to ≤1800 px JPEG.
- Photos: AES-256-GCM on the `receipts_data` volume (`RECEIPT_ENCRYPTION_KEY`), type sniffed from bytes. Worker reads with ilmu-vision-v1.3 (~2–6 s), pushes `receipt` events over SSE (`/api/events`), UI also polls while reading.
- Price memory: `itemKey()` (sorted lower-case words) + last unit price in the same currency. Warranty offered for items with a stated warranty or ≥ 50 in the receipt currency.
- No PDF upload yet (vision takes images); gallery images work.

## M5 — AI layer
- LangChain v1 agent on ILMU; tools scoped server-side; chat entry.
- **Ask your money** with charts; streaming answers.
- Token guard middleware + `ai_usage` ledger + per-user limits in Redis.
- **Test**: ask "How much on food this month?" → answer + chart; hit a low limit → friendly block.
- Done: LangChain v1 `createAgent` on ilmu-v3.1 with 6 read-only/"show" tools built per request (user id from the session), `TokenGuard` middleware (`wrapModelCall`: check allowance → call → record counts) + `modelCallLimitMiddleware(6)`. Answers stream over POST SSE (`/api/ask`): steps, words, charts, drafts. Chat history stays in the browser (localStorage), never on the server.
- Charts: single-hue bars (ranked) and a line with crosshair; `--chart-1` validated (#7a4fc4 light, #9d7bf5 dark); every chart has "Show numbers".

## M6 — Admin console
- Users list / search, ban / unban / delete, AI limits + kill switch, AI cockpit, email delivery stats,
  app settings, audit log. No route reaches money tables (test enforces this).
- **Test**: as admin, lower a user's limit and turn AI off; confirm no spending data is visible anywhere.
- Done: Overview (people, AI cockpit: tokens today/month, by feature, 30-day line, global AI switch, default allowance; email delivery), People (search, AI usage bar, AI limit + on/off, send reset link, pause/restore with email, delete with typed confirmation), Activity log.
- Account actions go through Better Auth's admin API (our role has no impersonate/set-password/set-email). Admins can't act on themselves or other admins. `admin.boundary.test.ts` fails if the admin module ever imports a money table.
- Settings live in `app_setting` (cached 30 s in Redis); the AI guard in API and worker reads them.

## M7 — Family Circle
- Invite by link / QR / email; relation; two-way accept; share levels; pause / stop; "what they see" panel.
- Family pulse feed with reactions (SSE); shared goal jars; photo bill splitter + split link.
- **Test**: two browsers — invite, accept, share categories, see live updates, pause sharing.
- Done: single-use invite links (SHA-256 stored, 7 days) with QR and optional email (also to people without an account; the link survives sign-up + onboarding). The inviter picks the relation and what they share; the invitee picks what they share back. Up to 12 people per circle, 10 open invites, 20 invites a day.
- Share levels totals → categories → expenses → expenses + receipts, per direction; pause / resume; stop (ends the connection, both grants and jar memberships). Changes notify live (SSE) and by email (at most one email per pair per 10 minutes).
- "What they see": the owner's preview and the viewer's screen are built by the same function (`shared-view.ts`); notes are never shared.
- Family pulse, built on read (pausing or deleting hides an item at once): shared expenses, jar deposits, new connections; one reaction per person per item.
- Shared goal jars: the owner adds people from their circle; members add money, only the owner takes out; who-put-in-what.
- Bill splitter: snap a bill (same camera as receipts) or pick a recent receipt, drag lines onto people or tap to choose; tax/service shared in proportion with exact-cent rounding; read-only split link + QR; mark paid; circle members see "split with you".

## M8 — Insights and emails
- Smart category learning, merchant clean-up (pgvector), subscription detector, heatmap.
- Money Wrapped story + shareable card.
- All notification emails + preferences + quiet hours + unsubscribe + hide amounts.
- Done: smart categories (every save teaches a shop's category; voice, receipts and the Type-it form use it), merchant clean-up (rules + bge-m3 embeddings in pgvector, merge below 0.17 cosine distance on lower-case keys), subscription/bill detection with price rises, bills still due kept aside in safe-to-spend, Insights tab (validated heatmap with list view, subscriptions), Money Wrapped story + shareable PNG (amounts can be hidden), Ask Spendid redesign + bills tool.
- Emails: one notifier for every optional email (preferences per group, sent at most once per key, quiet hours delay, hidden amounts, signed unsubscribe link + RFC 8058 one-click). Alerts: budget 80%/100%, unusual (3× usual), same charge twice, goal reached. Scheduled hourly in the API: Monday 8am weekly summary; 9am bills due (3 days), price rises, warranties (30 and 7 days); the 1st at 9am Money Wrapped. Security (always, never delayed): new kind of device, passkey added. AI allowance used up (from API or worker). Admin announcements to people who kept "Spendid news" on.
- Not in v1: trial-ending detection (no reliable signal without card data).

## M9 — Delight
- Pip the pangolin (moods, reactions), streaks, nightly check-in, impulse pause wishlist.
- Done: Pip on Home, drawn in SVG; mood = today's safe-to-spend (shining ≥60% left, calm, worried <20%, curled up when over, sleepy 11pm–6am) with one line about it; hops when something is logged. Streak = days in a row with spending logged or a check-in (today doesn't break it until it ends); milestones 3/7/14/30/60/100/365 celebrate once. Nightly check-in from 8pm local. Impulse pause on Plan: 48-hour wait with a ring, hours of work from income, skip (counts as saved) or still want it (opens the expense form filled in).

## M10 — Trust and polish
- Export (JSON / CSV / images) and full delete; hide balances; Bahasa Melayu; PWA install + offline shell.
- Playwright + axe E2E at 390 / 1280; phone audit; README + docs per feature; production Dockerfiles.
