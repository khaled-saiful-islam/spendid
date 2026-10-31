# Pay cycle and the "Your plan" sheet

Status: built (see `docs/superpowers/plans/2026-10-31-pay-cycle-and-plan-sheet.md`).

## Goal

1. **Cycle.** A person can budget by their own dates (e.g. 29 Oct → 28 Nov, payday to payday)
   instead of the calendar month, with the salary for that cycle. Every plan style works inside it.
2. **Quick plan change.** Changing the plan is one sheet with one Save, not the 3-step setup again.

People who never set a cycle see no change: the calendar month works exactly as today.

## Decisions (from the user)

| Question | Decision |
|---|---|
| Is a cycle a plan style? | No. It is the time period every plan style uses. |
| How is it set? | Start and end dates, picked each cycle. |
| When a cycle ends with no next one set | Spendid drafts the next one (same length, same salary) and asks to confirm. |
| Ask: "this month" | Always the calendar month. "This cycle", "last cycle" and budget questions use the cycle. |
| Changing the plan | One sheet: period, salary, style, live preview, one Save. |

## Rules

- A cycle has a start date, an end date (inclusive, in the person's time zone) and a salary.
- Length is 7 to 62 days. The current cycle must include today.
- No overlaps. Consecutive cycles have no gaps: when the current cycle's start moves, the previous
  cycle's end follows it (shorter or longer). If that would push the previous cycle outside
  7–62 days, the save is refused with a message.
- Past cycles are history and can't be edited directly (only the previous cycle's end moves, as
  above). The current cycle, draft or set, can be edited.
- When today passes the current cycle's end, the next cycle is drafted: it starts the day after,
  with the same length and salary. If the person was away longer, drafts continue back to back
  until one covers today. A draft counts like a real cycle; "Looks right" just marks it set.
- Salary, category limits and transfers are **per period**. They are not scaled by length: a
  person on two-week cycles sets two-week amounts. For cycle users, labels say "per cycle".
- Goals: the amount kept aside each cycle = what's still needed ÷ cycles left until the goal's
  date (counting cycles of the current length), rounded up. Calendar users keep today's monthly
  maths.
- The first cycle's salary is pre-filled from the monthly income already on the profile.
- Switching back to the calendar month applies to the current period straight away. Past cycles
  stay as history. Switching to cycles again starts a new run; days between runs were calendar
  months, so a gap there is allowed.

## Data

- `profile.period`: enum `month | cycle`, default `month` (migration; existing people stay `month`).
- New table `pay_cycle`:
  - `id` (uuid v7), `user_id` (→ user, cascade), `starts_on` date, `ends_on` date,
    `income_minor` bigint ≥ 0, `status` enum `set | draft`, `created_at`, `updated_at`.
  - Check: `ends_on` between `starts_on + 6` and `starts_on + 61`.
  - Exclusion constraint (btree_gist): no two rows of one person overlap
    (`daterange(starts_on, ends_on, '[]')`).
- `profile.monthly_income_minor` stays: it is the calendar-month income.
- Account export (`privacy`) adds `cycles.json`; account delete removes the rows (cascade).

## One period resolver

`monthBounds` (`apps/api/src/modules/money/summary.service.ts`) becomes `periodBounds(db, userId,
timeZone)`, the only place that decides "the current period":

```
{ kind: "month" | "cycle", today, start, end, nextStart, days, daysLeft,
  incomeMinor, cycleId, status: "set" | "draft" | null }
```

It drafts missing cycles (idempotent: the exclusion constraint makes a second insert a no-op).
`computeSafeToSpend` is already period-agnostic (it takes `daysLeft`); it gets the period's
income and days.

### What follows the period (cycle users) vs stays calendar

| Follows the period | Stays calendar month |
|---|---|
| Home: safe today, days to go, pace bar, stat tiles (`SafeCard`, `MonthPace`, `StatTiles`, `pace.ts`) | Insights month picker, charts, heatmap (`insights.service.ts`, `Heatmap.tsx`) |
| Plan: hero, limits, transfers, goals kept aside (`PlanHero`, `plan.repository.ts`) | Subscriptions "this month" total and its email (`subscriptions.service.ts`, `subscriptions-month`) |
| Bills still due before the period ends (`billsStillDue` takes the period start, not the 1st) | Money Wrapped recap |
| Budget alerts: 80% / over, "N days to go" (`alerts.ts`) | Weekly summary |
| Family view of the sharer's budget, "last cycle" comparison (`shared-view.ts`) | Ask "this month", "in November" |
| Ask budget tools and "this cycle" / "last cycle" | AI allowance month (unrelated) |

Cycle numbers are labelled "this cycle" with dates ("29 Oct → 28 Nov"), never "this month".

## Ask (red line)

- `tools/period.ts` adds `this_cycle` and `last_cycle`. For a calendar user they resolve to this
  and last calendar month, and the tool result says so ("no cycle set: calendar month used").
- `budget_overview` returns the period (`kind`, `start`, `end`, `daysLeft`) and per-period names
  (`incomeThisPeriod`, `limitPerPeriod`, …); its description says amounts are per cycle for
  cycle users.
- Prompt rule: "this month" and month names mean calendar months; "cycle", "this cycle",
  "since payday", "kitaran", "gaji ni" mean the cycle; what's left / am I over / safe today
  always use the period, and the answer states its dates.
- Coverage check: a question naming the cycle must be answered from a `this_cycle` /
  `last_cycle` read or `budget_overview`; otherwise the answer is refused and retried, like the
  existing coverage checks.

## Screens

### "Your plan" sheet

Opened by every link that goes to `/onboarding` today from Plan (`PlanHero` "Change", the two
`PlanPage` links, the "Pick a plan" card). Onboarding itself is unchanged.

- **Period:** two-way switch, *Calendar month* / *My own dates*. Own dates: start and end date
  inputs, with the length shown ("31 days").
- **Salary:** "Salary this cycle" or "Monthly income"; uses the shared `parseAmount`.
- **Plan style:** the four styles as cards, current one selected.
- **Live preview:** the daily amount, recalculated as fields change (shared `computeSafeToSpend`).
- **Save:** one request (`PUT /api/plan/setup`) saves period, cycle, salary and style in one
  transaction. Then the sheet closes, a "Plan saved" toast appears and the numbers animate.
  Closing without saving changes nothing.
- **Errors next to the field:** "A cycle is 7 to 62 days", "Today has to be inside your
  cycle", "This starts before your last cycle began", "Add your salary".
- Picking *Pay yourself first* with no transfers: after Save, the Plan page scrolls to its
  transfers editor ("Add what you send out first").
- Works at 360 px, keyboard and screen reader friendly, no cut text, animations kept.

### Home card for a draft cycle

Shown while the current cycle is a draft: "Your cycle ended on 28 Nov. Next: 29 Nov → 28 Dec ·
RM 4,500." Buttons: **Looks right** (marks it set; card goes) and **Change** (opens the sheet,
pre-filled).

### Reminder

On a cycle's last day, kind `cycle-ending`, group `budget` (same switch as budget alerts), through
the notifier: bell, email and phone, quiet hours respected, once per cycle.

## API

- `GET /api/plan/setup`: period, current cycle (or null), salary, style.
- `PUT /api/plan/setup`: body `{ period, cycle?: { startsOn, endsOn }, incomeMinor, method }`,
  Zod-validated; returns the same shape as GET.
- `POST /api/plan/cycle/confirm`: marks the current draft as set.
- All behind `requireMember` (admins never reach them).
- The daily worker job drafts cycles that ended and sends the last-day reminders.

## Testing (all must pass before any deploy)

- **Unit:** cycle maths (crossing a month, 31st and February, leap year, time zone at midnight),
  overlap/gap rules, drafting (one and several missed cycles), daily amount for both period kinds,
  bills due inside a cycle, goal share per cycle.
- **API:** save/edit/switch back, each refusal, the previous cycle's end moving, a draft made
  exactly once under parallel requests, every cycle-aware total checked against a hand-calculated
  figure, admin refused.
- **Ask:** accuracy cases: a cycle that crosses a month, an edited start, a draft cycle, a
  deleted expense in the cycle, "this month" vs "this cycle" on the same day, a calendar user
  asking about "this cycle"; plus the live model eval.
- **Browser:** the sheet on phone (360 px) and desktop, Home card *Looks right* and *Change*,
  switching back to the calendar month, accessibility checks.

## Out of scope

- A fixed-payday rule ("the 29th every month"); dates are picked per cycle, with drafts in between.
- Insights, charts and recaps by cycle.
- Changing onboarding.
