# Testing

| Command | What it runs | Where |
|---|---|---|
| `make test` | Unit + API tests (Vitest), against the dev database | Docker |
| `make coverage` | The same tests with a coverage summary per package (CI runs this) | Docker |
| `make typecheck` | TypeScript across every package | Docker |
| `make check` | Biome lint + format check | Docker |
| `make e2e` | Browser + accessibility tests at 390 px (phone) and 1280 px (desktop) | Host |

Run one test command at a time: they share the dev database, and the Docker VM is small.

## Browser tests (`e2e/`)

Needs the app running (`make up`) and the demo people (`make demo`). The first run installs
Playwright's Chromium on your machine.

| File | Covers |
|---|---|
| `tests/signup.spec.ts` | Sign up → sign-in refused until the email is confirmed → confirm from Mailpit → onboarding → today's number → delete the account → goodbye email |
| `tests/member.spec.ts` | Home with Pip, add an expense by typing → Activity → remove it, hide amounts (header on phones, account menu on desktop), Ask welcome, Family, subscriptions, challenges, Pip's briefing, month pace, chat delete, no sideways scroll |
| `tests/admin.spec.ts` | Admin is kept out of member pages and member data |
| `tests/a11y.spec.ts` | axe (WCAG 2.2 AA) on every main page, with reduced motion so it judges the settled screen |

- `global-setup.ts` signs `maya` and `admin` in once and sets maya's language to English, so tests
  read English text.
- Tests clean up after themselves (the expense and the sign-up account are removed).
- Point at another server with `E2E_BASE_URL`, `E2E_MAILPIT_URL`, `E2E_MEMBER_USER` / `_PASSWORD`,
  `E2E_ADMIN_USER` / `_PASSWORD`.
- On failure, `e2e/playwright-report/` has screenshots and traces (`npx playwright show-report`).
