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
| M4 | Receipt camera + line items + price memory + warranty vault | ⏳ |
| M5 | AI layer: agent, ask-your-money, token guard | ☐ |
| M6 | Admin console + AI cockpit | ☐ |
| M7 | Family Circle: connections, sharing, pulse, goal jars, bill split | ☐ |
| M8 | Insights + all notification emails + Money Wrapped | ☐ |
| M9 | Delight: Pip, streaks, nightly check-in, impulse pause | ☐ |
| M10 | Trust + polish: export / delete, hide balances, BM, PWA, E2E, phone audit, docs | ☐ |

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

## M5 — AI layer
- LangChain v1 agent on ILMU; tools scoped server-side; chat entry.
- **Ask your money** with charts; streaming answers.
- Token guard middleware + `ai_usage` ledger + per-user limits in Redis.
- **Test**: ask "How much on food this month?" → answer + chart; hit a low limit → friendly block.

## M6 — Admin console
- Users list / search, ban / unban / delete, AI limits + kill switch, AI cockpit, email delivery stats,
  app settings, audit log. No route reaches money tables (test enforces this).
- **Test**: as admin, lower a user's limit and turn AI off; confirm no spending data is visible anywhere.

## M7 — Family Circle
- Invite by link / QR / email; relation; two-way accept; share levels; pause / stop; "what they see" panel.
- Family pulse feed with reactions (SSE); shared goal jars; photo bill splitter + split link.
- **Test**: two browsers — invite, accept, share categories, see live updates, pause sharing.

## M8 — Insights and emails
- Smart category learning, merchant clean-up (pgvector), subscription detector, heatmap.
- Money Wrapped story + shareable card.
- All notification emails + preferences + quiet hours + unsubscribe + hide amounts.

## M9 — Delight
- Pip the pangolin (moods, reactions), streaks, nightly check-in, impulse pause wishlist.

## M10 — Trust and polish
- Export (JSON / CSV / images) and full delete; hide balances; Bahasa Melayu; PWA install + offline shell.
- Playwright + axe E2E at 390 / 1280; phone audit; README + docs per feature; production Dockerfiles.
