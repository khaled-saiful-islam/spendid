# Pay cycle and "Your plan" sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person budget by their own cycle dates (with the salary for that cycle), and change their plan from one sheet with one Save.

**Architecture:** Cycles are rows in a new `pay_cycle` table; `profile.period` says whether the person uses the calendar month or cycles. One resolver, `periodBounds`, decides "the current period" (and drafts the next cycle when one ends); every number that follows the plan reads it instead of the calendar-month helper. The web gets a `PlanSheet` that saves period, cycle, salary and style through one endpoint, with a server-computed preview.

Two refinements of the spec, same behaviour: drafting happens whenever the period is read (no separate worker job), and the last-day reminder rides the API's existing hourly digest tick. The sheet's live daily amount comes from a server preview endpoint, so it uses exactly the maths Home uses.

**Tech Stack:** Node 24, Fastify 5, TypeScript, Drizzle + Postgres 18 (btree_gist), Zod 4, LangChain tools (Ask), React 19, TanStack Query, Tailwind 4, Motion, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-pay-cycle-and-plan-sheet-design.md`

## Global Constraints

- A cycle is 7 to 62 days, start and end included; the current cycle must include today (person's time zone).
- No overlaps (DB exclusion constraint); consecutive cycles in one run have no gaps (the previous cycle's end follows the new start).
- People with `period = 'month'` see no change: every existing test must still pass unchanged, except where this plan says to edit it.
- Ask: "this month" and month names are calendar months; "this cycle"/"last cycle" and budget questions use the period; answers name the dates. Deleted expenses never count.
- Salary, limits and transfers are per period, never scaled by length.
- Admins never reach any of this (`requireMember`).
- Every user-visible string goes through `t()` and gets a Malay entry in `apps/web/src/i18n/ms/g.ts`.
- No cut text, animations kept, works at 360 px with no sideways scroll.
- One test run at a time (shared dev DB). No deploy or push until the user asks.
- Commits end with `Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25`.

## Review Focus

1. **Midnight in Kuala Lumpur:** at 00:30 local on a cycle's first day (16:30 UTC the day before), the current period is the new cycle, not the old one. → Task 3 test "uses the person's own day at midnight".
2. **Away for weeks:** the last cycle ended 70 days ago; opening the app drafts cycles back to back until one covers today, with no overlaps and only the last one current. → Task 3 test "drafts several cycles after a long absence".
3. **Two requests at once:** two summary loads (or two tabs) after a cycle ends make exactly one draft, and nobody sees an error. → Task 3 test "drafts once under parallel requests".
4. **Empty or half-typed dates in the sheet:** Save stays blocked with "Pick the start and end dates." and nothing is sent. → Task 11 E2E "empty dates are refused".
5. **The sums still add up on a cycle:** for a cycle user with pay yourself first, `left = salary − transfers − bills due in the cycle − spent in the cycle`, checked against hand-calculated numbers that include an expense before the cycle and a deleted one. → Task 4 test "cycle totals match a hand calculation".

---

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/cycle.ts` (new) | Pure cycle maths, period/setup schemas |
| `packages/db/src/schema/cycle.ts` (new), `profile.ts` | `pay_cycle` table, `profile.period` |
| `packages/db/drizzle/0021_*.sql` (generated + 2 lines) | Migration, btree_gist exclusion |
| `apps/api/src/modules/money/period.ts` (new) | `periodBounds`, `previousPeriod`, drafting |
| `apps/api/src/modules/money/summary.service.ts` | Summary per period, `preview` |
| `apps/api/src/modules/money/plan-setup.service.ts` (new) | get / save / confirm / preview |
| `apps/api/src/modules/money/money.routes.ts` | `/plan/setup`, `/plan/setup/preview`, `/plan/cycle/confirm` |
| `apps/api/src/http/field-error.ts` (new) | Field-level 400s from services |
| `packages/shared/src/recurring.ts`, `apps/api/src/modules/insights/charges.ts` | Bills due inside a window |
| `apps/api/src/modules/money/plan.repository.ts` | Goal share per period |
| `apps/api/src/notify/alerts.ts`, `apps/api/src/modules/family/shared-view.ts` | Follow the period |
| `apps/api/src/notify/digests.ts` | `cycle-ending` reminder |
| `apps/api/src/modules/ask/tools/{period,filters,context,read}.ts`, `coverage.ts`, `ask.agent.ts` | this_cycle / last_cycle |
| `apps/web/src/lib/plan-setup-api.ts`, `apps/web/src/lib/period-words.ts` (new) | API client, period wording |
| `apps/web/src/features/plan/PlanSheet.tsx` (new) | The sheet |
| `apps/web/src/features/home/DraftCycleCard.tsx` (new) | "Your cycle ended" card |
| `apps/web/src/i18n/ms/g.ts` (new) | Malay strings |

---

### Task 1: Shared cycle maths and setup schemas

**Files:**
- Create: `packages/shared/src/cycle.ts`
- Create: `packages/shared/src/cycle.test.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./cycle";`)

**Interfaces:**
- Produces: `PERIOD_KINDS`, `PeriodKind`, `CYCLE_STATUSES`, `CycleStatus`, `CYCLE_MIN_DAYS = 7`, `CYCLE_MAX_DAYS = 62`, `addDays(day, n): string`, `daysInclusive(from, to): number`, `CycleRange { startsOn; endsOn }`, `checkCycle({ range, today, previous, joinPrevious }): CycleCheck`, `nextCycle(last): CycleRange`, `draftsUntil(last, today): CycleRange[]`, `goalCycleNeeded(goal, cycleStart, cycleDays): number`, `PeriodSchema`/`Period`, `PlanSetupInputSchema`/`PlanSetupInput`, `PlanSetupSchema`/`PlanSetup`, `PlanPreviewSchema`/`PlanPreview`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/cycle.test.ts
import { describe, expect, it } from "vitest";
import {
	addDays,
	checkCycle,
	daysInclusive,
	draftsUntil,
	goalCycleNeeded,
	nextCycle,
	PlanSetupInputSchema,
} from "./cycle";

describe("day maths", () => {
	it("adds days across months, leap years and years", () => {
		expect(addDays("2026-10-29", 3)).toBe("2026-11-01");
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
		expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
	});
	it("counts both ends", () => {
		expect(daysInclusive("2026-10-29", "2026-10-29")).toBe(1);
		expect(daysInclusive("2026-10-29", "2026-11-28")).toBe(31);
		expect(daysInclusive("2028-02-01", "2028-02-29")).toBe(29);
	});
});

describe("checkCycle", () => {
	const today = "2026-10-31";
	const range = { startsOn: "2026-10-29", endsOn: "2026-11-28" };

	it("accepts a first cycle around today", () => {
		expect(checkCycle({ range, today, previous: null, joinPrevious: false })).toEqual({
			ok: true,
			previousEndsOn: null,
		});
	});
	it("refuses an end before the start", () => {
		expect(
			checkCycle({ range: { startsOn: "2026-10-29", endsOn: "2026-10-20" }, today, previous: null, joinPrevious: false }),
		).toMatchObject({ ok: false, field: "endsOn", message: "The end has to be after the start." });
	});
	it("refuses fewer than 7 or more than 62 days", () => {
		const short = { startsOn: "2026-10-29", endsOn: "2026-11-03" };
		const long = { startsOn: "2026-10-01", endsOn: "2026-12-02" };
		expect(checkCycle({ range: short, today, previous: null, joinPrevious: false })).toMatchObject({ ok: false, message: "A cycle is 7 to 62 days." });
		expect(checkCycle({ range: long, today, previous: null, joinPrevious: false })).toMatchObject({ ok: false, message: "A cycle is 7 to 62 days." });
		expect(checkCycle({ range: { startsOn: "2026-10-29", endsOn: "2026-11-04" }, today, previous: null, joinPrevious: false }).ok).toBe(true);
		expect(checkCycle({ range: { startsOn: "2026-10-01", endsOn: "2026-12-01" }, today, previous: null, joinPrevious: false }).ok).toBe(true);
	});
	it("refuses a cycle that doesn't include today", () => {
		expect(
			checkCycle({ range: { startsOn: "2026-11-01", endsOn: "2026-11-30" }, today, previous: null, joinPrevious: false }),
		).toMatchObject({ ok: false, field: "startsOn", message: "Today has to be inside your cycle." });
		expect(
			checkCycle({ range: { startsOn: "2026-10-01", endsOn: "2026-10-30" }, today, previous: null, joinPrevious: false }),
		).toMatchObject({ ok: false, message: "Today has to be inside your cycle." });
	});
	it("moves the previous cycle's end to the day before the new start", () => {
		const previous = { startsOn: "2026-09-29", endsOn: "2026-10-28" };
		expect(checkCycle({ range: { startsOn: "2026-10-27", endsOn: "2026-11-26" }, today, previous, joinPrevious: true })).toEqual({ ok: true, previousEndsOn: "2026-10-26" });
		expect(checkCycle({ range: { startsOn: "2026-10-31", endsOn: "2026-11-29" }, today, previous, joinPrevious: true })).toEqual({ ok: true, previousEndsOn: "2026-10-30" });
	});
	it("refuses a start on or before the previous cycle's start", () => {
		const previous = { startsOn: "2026-10-20", endsOn: "2026-10-28" };
		expect(checkCycle({ range: { startsOn: "2026-10-20", endsOn: "2026-11-15" }, today, previous, joinPrevious: true })).toMatchObject({ ok: false, field: "startsOn", message: "This starts before your last cycle began." });
	});
	it("refuses leaving the previous cycle under 7 or over 62 days", () => {
		const previous = { startsOn: "2026-10-25", endsOn: "2026-10-28" };
		expect(checkCycle({ range: { startsOn: "2026-10-29", endsOn: "2026-11-28" }, today, previous, joinPrevious: true })).toMatchObject({ ok: false, message: "That would make your last cycle shorter than 7 days." });
		const old = { startsOn: "2026-08-20", endsOn: "2026-09-19" };
		expect(checkCycle({ range: { startsOn: "2026-10-29", endsOn: "2026-11-28" }, today, previous: old, joinPrevious: true })).toMatchObject({ ok: false, message: "That would make your last cycle longer than 62 days." });
	});
	it("allows a gap after calendar months (a new run), but never an overlap", () => {
		const old = { startsOn: "2026-08-20", endsOn: "2026-09-19" };
		expect(checkCycle({ range, today, previous: old, joinPrevious: false })).toEqual({ ok: true, previousEndsOn: null });
		const touching = { startsOn: "2026-10-01", endsOn: "2026-10-30" };
		expect(checkCycle({ range, today, previous: touching, joinPrevious: false })).toEqual({ ok: true, previousEndsOn: "2026-10-28" });
	});
});

describe("drafts", () => {
	it("starts the next cycle the day after, with the same length", () => {
		expect(nextCycle({ startsOn: "2026-10-29", endsOn: "2026-11-28" })).toEqual({ startsOn: "2026-11-29", endsOn: "2026-12-29" });
		expect(nextCycle({ startsOn: "2028-02-01", endsOn: "2028-02-14" })).toEqual({ startsOn: "2028-02-15", endsOn: "2028-02-28" });
	});
	it("drafts nothing while the last cycle covers today", () => {
		expect(draftsUntil({ startsOn: "2026-10-29", endsOn: "2026-11-28" }, "2026-11-28")).toEqual([]);
	});
	it("drafts back to back until one covers today", () => {
		const drafts = draftsUntil({ startsOn: "2026-08-01", endsOn: "2026-08-30" }, "2026-10-31");
		expect(drafts).toEqual([
			{ startsOn: "2026-08-31", endsOn: "2026-09-29" },
			{ startsOn: "2026-09-30", endsOn: "2026-10-29" },
			{ startsOn: "2026-10-30", endsOn: "2026-11-28" },
		]);
	});
});

describe("goalCycleNeeded", () => {
	const goal = { targetMinor: 120_000, savedMinor: 20_000, targetDate: "2027-01-27" };
	it("splits what's left over the cycles until the date, rounded up", () => {
		// 29 Oct → 27 Jan is 91 days; 31-day cycles → 3 cycles; 100,000 / 3 = 33,333.33 → 33,334.
		expect(goalCycleNeeded(goal, "2026-10-29", 31)).toBe(33_334);
	});
	it("needs nothing for open-ended or finished goals", () => {
		expect(goalCycleNeeded({ ...goal, targetDate: null }, "2026-10-29", 31)).toBe(0);
		expect(goalCycleNeeded({ ...goal, savedMinor: 120_000 }, "2026-10-29", 31)).toBe(0);
	});
	it("asks for everything this cycle when the date has passed", () => {
		expect(goalCycleNeeded({ ...goal, targetDate: "2026-10-01" }, "2026-10-29", 31)).toBe(100_000);
	});
});

describe("PlanSetupInputSchema", () => {
	it("needs dates for a cycle", () => {
		const r = PlanSetupInputSchema.safeParse({ period: "cycle", cycle: null, incomeMinor: 450_000, method: null });
		expect(r.success).toBe(false);
		expect(r.error?.issues[0]).toMatchObject({ path: ["cycle", "startsOn"], message: "Pick the start and end dates." });
	});
	it("accepts the calendar month without dates", () => {
		expect(PlanSetupInputSchema.parse({ period: "month", cycle: null, incomeMinor: 450_000, method: "envelope" }).period).toBe("month");
	});
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd packages/shared && pnpm vitest run src/cycle.test.ts'`
Expected: FAIL, `Cannot find module './cycle'`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/cycle.ts
import { z } from "zod";
import { BUDGET_METHODS } from "./profile";

/** The budget period: the calendar month, or the person's own cycle (payday to payday). */
export const PERIOD_KINDS = ["month", "cycle"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
/** A draft is a cycle Spendid made when the last one ended; "Looks right" marks it set. */
export const CYCLE_STATUSES = ["set", "draft"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const CYCLE_MIN_DAYS = 7;
export const CYCLE_MAX_DAYS = 62;

const DAY_MS = 86_400_000;
const at = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function addDays(day: string, n: number): string {
	return new Date(at(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included (the same day is 1). */
export function daysInclusive(from: string, to: string): number {
	return Math.round((at(to) - at(from)) / DAY_MS) + 1;
}

export interface CycleRange {
	startsOn: string;
	endsOn: string;
}

export type CycleCheck =
	| { ok: true; previousEndsOn: string | null }
	| { ok: false; field: "startsOn" | "endsOn"; message: string };

/**
 * Whether a cycle can be saved as the current one. `previous` is the cycle before it (null: none).
 * Its end follows the new start, so it must stay 7 to 62 days. `joinPrevious` is false for a new
 * run after calendar months: a gap is then fine, an overlap still moves the previous end.
 * `previousEndsOn` is the previous cycle's new end, or null to leave it as it is.
 */
export function checkCycle(input: {
	range: CycleRange;
	today: string;
	previous: CycleRange | null;
	joinPrevious: boolean;
}): CycleCheck {
	const { range, today, previous } = input;
	if (range.endsOn < range.startsOn)
		return { ok: false, field: "endsOn", message: "The end has to be after the start." };
	const days = daysInclusive(range.startsOn, range.endsOn);
	if (days < CYCLE_MIN_DAYS || days > CYCLE_MAX_DAYS)
		return { ok: false, field: "endsOn", message: "A cycle is 7 to 62 days." };
	if (range.startsOn > today || range.endsOn < today)
		return { ok: false, field: "startsOn", message: "Today has to be inside your cycle." };
	if (!previous) return { ok: true, previousEndsOn: null };
	if (range.startsOn <= previous.startsOn)
		return { ok: false, field: "startsOn", message: "This starts before your last cycle began." };
	const touches = range.startsOn <= addDays(previous.endsOn, 1);
	if (!touches && !input.joinPrevious) return { ok: true, previousEndsOn: null };
	const previousEndsOn = addDays(range.startsOn, -1);
	const previousDays = daysInclusive(previous.startsOn, previousEndsOn);
	if (previousDays < CYCLE_MIN_DAYS)
		return { ok: false, field: "startsOn", message: "That would make your last cycle shorter than 7 days." };
	if (previousDays > CYCLE_MAX_DAYS)
		return { ok: false, field: "startsOn", message: "That would make your last cycle longer than 62 days." };
	return { ok: true, previousEndsOn };
}

/** The cycle after `last`: it starts the day after, with the same length. */
export function nextCycle(last: CycleRange): CycleRange {
	const startsOn = addDays(last.endsOn, 1);
	return { startsOn, endsOn: addDays(startsOn, daysInclusive(last.startsOn, last.endsOn) - 1) };
}

/** Drafts after `last`, back to back, until one covers `today` (none while `last` does). */
export function draftsUntil(last: CycleRange, today: string): CycleRange[] {
	const drafts: CycleRange[] = [];
	let current = last;
	while (current.endsOn < today) {
		current = nextCycle(current);
		drafts.push(current);
	}
	return drafts;
}

/**
 * A goal's share of one cycle: what's still needed ÷ the cycles (of this length) left from the
 * cycle's start to the goal's date, rounded up. Counted from the start so it holds all cycle.
 */
export function goalCycleNeeded(
	goal: { targetMinor: number; savedMinor: number; targetDate: string | null },
	cycleStart: string,
	cycleDays: number,
): number {
	const remaining = goal.targetMinor - goal.savedMinor;
	if (remaining <= 0 || !goal.targetDate) return 0;
	const days = daysInclusive(cycleStart, goal.targetDate);
	const cycles = Math.max(1, Math.ceil(days / cycleDays));
	return Math.ceil(remaining / cycles);
}

/** The period every plan number covers. */
export const PeriodSchema = z.object({
	kind: z.enum(PERIOD_KINDS),
	start: z.iso.date(),
	/** Last day, included. */
	end: z.iso.date(),
	days: z.number().int(),
	cycleId: z.uuid().nullable(),
	status: z.enum(CYCLE_STATUSES).nullable(),
});
export type Period = z.infer<typeof PeriodSchema>;

const CycleRangeSchema = z.object({ startsOn: z.iso.date(), endsOn: z.iso.date() });

/** What the "Your plan" sheet saves. */
export const PlanSetupInputSchema = z
	.object({
		period: z.enum(PERIOD_KINDS),
		cycle: CycleRangeSchema.nullable(),
		incomeMinor: z.number().int().min(0).max(10_000_000_000_000),
		method: z.enum(BUDGET_METHODS).nullable(),
	})
	.superRefine((v, ctx) => {
		if (v.period === "cycle" && !v.cycle)
			ctx.addIssue({ code: "custom", path: ["cycle", "startsOn"], message: "Pick the start and end dates." });
	});
export type PlanSetupInput = z.infer<typeof PlanSetupInputSchema>;

export const PlanSetupSchema = z.object({
	period: z.enum(PERIOD_KINDS),
	cycle: CycleRangeSchema.extend({ id: z.uuid(), status: z.enum(CYCLE_STATUSES) }).nullable(),
	/** The cycle's salary, or the monthly income. */
	incomeMinor: z.number().nullable(),
	method: z.enum(BUDGET_METHODS).nullable(),
	today: z.iso.date(),
});
export type PlanSetup = z.infer<typeof PlanSetupSchema>;

export const PlanPreviewSchema = z.object({
	status: z.enum(["ok", "over", "no-income"]),
	dailyAllowanceMinor: z.number(),
	days: z.number().int(),
	daysLeft: z.number().int(),
});
export type PlanPreview = z.infer<typeof PlanPreviewSchema>;
```

Add to `packages/shared/src/index.ts` after `export * from "./categories";`: `export * from "./cycle";`

- [ ] **Step 4: Run to see them pass**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd packages/shared && pnpm vitest run src/cycle.test.ts'`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/cycle.ts packages/shared/src/cycle.test.ts packages/shared/src/index.ts
git commit -m "feat: cycle maths and plan setup schemas

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 2: Database: `profile.period` and `pay_cycle`

**Files:**
- Create: `packages/db/src/schema/cycle.ts`
- Modify: `packages/db/src/schema/profile.ts`, `packages/db/src/schema/index.ts`
- Generate: `packages/db/drizzle/0021_*.sql` (then append the exclusion constraint)
- Modify: `apps/api/src/modules/privacy/export-data.ts`, `apps/api/src/modules/privacy/report.ts`
- Test: `apps/api/src/modules/money/period.integration.test.ts` (created here with the constraint tests; Task 3 adds to it)

**Interfaces:**
- Produces: `periodKind` enum, `profile.period` (`"month" | "cycle"`, default `"month"`), `payCycle` table `{ id, userId, startsOn: string, endsOn: string, incomeMinor: number, status: "set" | "draft", createdAt, updatedAt }`, constraint `pay_cycle_no_overlap` (deferrable, initially deferred).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/money/period.integration.test.ts
import { createDb, payCycle } from "@spendid/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";

const url = testDbUrl();

describe.skipIf(!url)("pay cycles (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let maya: string;

	beforeAll(async () => {
		maya = await createPerson(db);
	});
	afterAll(async () => {
		await database.close();
	});

	it("refuses overlapping cycles for one person", async () => {
		await db.insert(payCycle).values({ userId: maya, startsOn: "2026-01-01", endsOn: "2026-01-31", incomeMinor: 1 });
		await expect(
			db.insert(payCycle).values({ userId: maya, startsOn: "2026-01-31", endsOn: "2026-02-27", incomeMinor: 1 }),
		).rejects.toThrow(/pay_cycle_no_overlap/);
	});

	it("refuses cycles under 7 or over 62 days", async () => {
		await expect(
			db.insert(payCycle).values({ userId: maya, startsOn: "2026-03-01", endsOn: "2026-03-06", incomeMinor: 1 }),
		).rejects.toThrow(/pay_cycle_length/);
		await expect(
			db.insert(payCycle).values({ userId: maya, startsOn: "2026-03-01", endsOn: "2026-05-02", incomeMinor: 1 }),
		).rejects.toThrow(/pay_cycle_length/);
	});

	it("lets a transaction swap two cycles' edges (checked at commit)", async () => {
		const [a] = await db.insert(payCycle).values({ userId: maya, startsOn: "2026-06-01", endsOn: "2026-06-30", incomeMinor: 1 }).returning();
		const [b] = await db.insert(payCycle).values({ userId: maya, startsOn: "2026-07-01", endsOn: "2026-07-31", incomeMinor: 1 }).returning();
		await db.transaction(async (tx) => {
			const { eq } = await import("drizzle-orm");
			await tx.update(payCycle).set({ startsOn: "2026-06-25" }).where(eq(payCycle.id, b!.id));
			await tx.update(payCycle).set({ endsOn: "2026-06-24" }).where(eq(payCycle.id, a!.id));
		});
	});
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money/period.integration.test.ts'`
Expected: FAIL, `payCycle` is not exported from `@spendid/db`.

- [ ] **Step 3: Implement the schema**

```ts
// packages/db/src/schema/cycle.ts
import { sql } from "drizzle-orm";
import { bigint, check, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const cycleStatus = pgEnum("cycle_status", ["set", "draft"]);

/**
 * One budget cycle, start and end included (the person's own days). Overlaps are refused by
 * `pay_cycle_no_overlap`, an exclusion constraint added by hand in migration 0021.
 */
export const payCycle = pgTable(
	"pay_cycle",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		startsOn: date().notNull(),
		endsOn: date().notNull(),
		incomeMinor: bigint({ mode: "number" }).notNull(),
		status: cycleStatus().notNull().default("set"),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("pay_cycle_user_idx").on(t.userId, t.startsOn),
		check("pay_cycle_length", sql`${t.endsOn} between ${t.startsOn} + 6 and ${t.startsOn} + 61`),
		check("pay_cycle_income_not_negative", sql`${t.incomeMinor} >= 0`),
	],
);
```

In `packages/db/src/schema/profile.ts`, after the `budgetMethod` enum:

```ts
/** Calendar month, or the person's own cycles (`pay_cycle`). */
export const periodKind = pgEnum("period_kind", ["month", "cycle"]);
```

and in the `profile` columns, after `budgetMethod: budgetMethod(),`:

```ts
		/** What "this period" means for the plan; cycles live in `pay_cycle`. */
		period: periodKind().notNull().default("month"),
```

In `packages/db/src/schema/index.ts` add `export * from "./cycle";` (keep the list alphabetical: after `./challenges`).

- [ ] **Step 4: Generate the migration and add the exclusion constraint**

Run: `cd ~/projects/spendid && make db-generate`
Expected: a new `packages/db/drizzle/0021_<name>.sql` creating `cycle_status`, `period_kind`, `pay_cycle` and `profile.period`.

Append to the end of that file (Drizzle can't express exclusion constraints):

```sql
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "pay_cycle" ADD CONSTRAINT "pay_cycle_no_overlap" EXCLUDE USING gist ("user_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&) DEFERRABLE INITIALLY DEFERRED;
```

Apply to the dev database: `cd ~/projects/spendid && docker compose run --rm migrate` (the test database is migrated by `apps/api/test/global-setup.ts` on each test run).

- [ ] **Step 5: Export cycles with the person's data**

In `apps/api/src/modules/privacy/export-data.ts`, import `payCycle` from `@spendid/db` and add to the returned object after `transfers`:

```ts
		cycles: await db
			.select({
				startsOn: payCycle.startsOn,
				endsOn: payCycle.endsOn,
				incomeMinor: payCycle.incomeMinor,
				status: payCycle.status,
			})
			.from(payCycle)
			.where(eq(payCycle.userId, userId))
			.orderBy(payCycle.startsOn),
```

In `apps/api/src/modules/privacy/report.ts`, after the "Monthly transfers" block:

```ts
	if (data.cycles.length > 0) {
		r.section("Budget cycles");
		r.table(
			[
				{ label: "From", width: 2 },
				{ label: "To", width: 2 },
				{ label: "Salary", width: 2, align: "right" },
			],
			data.cycles.map((c) => [c.startsOn, c.endsOn, money(c.incomeMinor, home)]),
		);
	}
```

- [ ] **Step 6: Run the tests**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money/period.integration.test.ts src/modules/privacy'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db apps/api/src/modules/money/period.integration.test.ts apps/api/src/modules/privacy
git commit -m "feat: pay_cycle table and profile period

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 3: One period resolver, with drafting

**Files:**
- Create: `apps/api/src/modules/money/period.ts`
- Modify: `apps/api/src/modules/money/period.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 `addDays`, `daysInclusive`, `draftsUntil`; Task 2 `payCycle`, `profile.period`.
- Produces:
  - `localDay(timeZone: string, at?: Date): string`
  - `calendarMonth(today: string, incomeMinor: number | null): PeriodBounds`
  - `cycleBounds(today: string, row: { id: string; startsOn: string; endsOn: string; incomeMinor: number; status: CycleStatus }): PeriodBounds`
  - `periodBounds(db: Db, userId: string, at?: Date): Promise<PeriodBounds>`
  - `previousPeriod(db: Db, userId: string, bounds: PeriodBounds): Promise<{ kind: PeriodKind; start: string; end: string }>`
  - `interface PeriodBounds { kind; today; start; end; nextStart; days; daysLeft; incomeMinor: number | null; cycleId: string | null; status: CycleStatus | null }`

- [ ] **Step 1: Write the failing tests** (append inside the `describe` of `period.integration.test.ts`; add imports `profile` from `@spendid/db`, `eq` from `drizzle-orm`, and `periodBounds, previousPeriod` from `./period`)

```ts
	const toCycle = async (userId: string, rows: { startsOn: string; endsOn: string; incomeMinor?: number }[]) => {
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, userId));
		await db.insert(payCycle).values(rows.map((r) => ({ userId, incomeMinor: 450_000, ...r })));
	};
	const kl = (iso: string) => new Date(iso);

	it("is the calendar month for someone without cycles", async () => {
		const sam = await createPerson(db);
		const b = await periodBounds(db, sam, kl("2026-10-31T04:00:00Z"));
		expect(b).toMatchObject({ kind: "month", today: "2026-10-31", start: "2026-10-01", end: "2026-10-31", nextStart: "2026-11-01", days: 31, daysLeft: 1, incomeMinor: 600_000, cycleId: null, status: null });
	});

	it("is the cycle covering today, with its own salary", async () => {
		const ali = await createPerson(db);
		await toCycle(ali, [{ startsOn: "2026-10-29", endsOn: "2026-11-28", incomeMinor: 512_300 }]);
		const b = await periodBounds(db, ali, kl("2026-10-31T04:00:00Z"));
		expect(b).toMatchObject({ kind: "cycle", start: "2026-10-29", end: "2026-11-28", nextStart: "2026-11-29", days: 31, daysLeft: 29, incomeMinor: 512_300, status: "set" });
	});

	it("uses the person's own day at midnight", async () => {
		const zara = await createPerson(db);
		await toCycle(zara, [
			{ startsOn: "2026-09-29", endsOn: "2026-10-28" },
			{ startsOn: "2026-10-29", endsOn: "2026-11-28" },
		]);
		// 16:30 UTC on 28 Oct is 00:30 on 29 Oct in Kuala Lumpur.
		const b = await periodBounds(db, zara, kl("2026-10-28T16:30:00Z"));
		expect(b.start).toBe("2026-10-29");
		expect(b.today).toBe("2026-10-29");
	});

	it("drafts the next cycle when the last one has ended", async () => {
		const lee = await createPerson(db);
		await toCycle(lee, [{ startsOn: "2026-09-29", endsOn: "2026-10-28", incomeMinor: 400_000 }]);
		const b = await periodBounds(db, lee, kl("2026-10-31T04:00:00Z"));
		expect(b).toMatchObject({ start: "2026-10-29", end: "2026-11-27", incomeMinor: 400_000, status: "draft" });
	});

	it("drafts several cycles after a long absence", async () => {
		const ben = await createPerson(db);
		await toCycle(ben, [{ startsOn: "2026-07-01", endsOn: "2026-07-30" }]);
		const b = await periodBounds(db, ben, kl("2026-10-31T04:00:00Z"));
		const rows = await db.select().from(payCycle).where(eq(payCycle.userId, ben)).orderBy(payCycle.startsOn);
		expect(rows.map((r) => [r.startsOn, r.endsOn, r.status])).toEqual([
			["2026-07-01", "2026-07-30", "set"],
			["2026-07-31", "2026-08-29", "draft"],
			["2026-08-30", "2026-09-28", "draft"],
			["2026-09-29", "2026-10-28", "draft"],
			["2026-10-29", "2026-11-27", "draft"],
		]);
		expect(b.start).toBe("2026-10-29");
	});

	it("drafts once under parallel requests", async () => {
		const ida = await createPerson(db);
		await toCycle(ida, [{ startsOn: "2026-09-29", endsOn: "2026-10-28" }]);
		const at = kl("2026-10-31T04:00:00Z");
		const all = await Promise.all(Array.from({ length: 6 }, () => periodBounds(db, ida, at)));
		expect(new Set(all.map((b) => b.cycleId)).size).toBe(1);
		const rows = await db.select().from(payCycle).where(eq(payCycle.userId, ida));
		expect(rows).toHaveLength(2);
	});

	it("knows the period before: last calendar month, or the cycle before", async () => {
		const ann = await createPerson(db);
		const m = await periodBounds(db, ann, kl("2026-10-31T04:00:00Z"));
		expect(await previousPeriod(db, ann, m)).toEqual({ kind: "month", start: "2026-09-01", end: "2026-09-30" });
		await toCycle(ann, [
			{ startsOn: "2026-09-29", endsOn: "2026-10-28" },
			{ startsOn: "2026-10-29", endsOn: "2026-11-28" },
		]);
		const c = await periodBounds(db, ann, kl("2026-10-31T04:00:00Z"));
		expect(await previousPeriod(db, ann, c)).toEqual({ kind: "cycle", start: "2026-09-29", end: "2026-10-28" });
	});

	it("falls back to last calendar month before the first cycle", async () => {
		const joe = await createPerson(db);
		await toCycle(joe, [{ startsOn: "2026-10-29", endsOn: "2026-11-28" }]);
		const c = await periodBounds(db, joe, kl("2026-10-31T04:00:00Z"));
		expect(await previousPeriod(db, joe, c)).toEqual({ kind: "month", start: "2026-09-01", end: "2026-09-30" });
	});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money/period.integration.test.ts'`
Expected: FAIL, `Cannot find module './period'`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/money/period.ts
import { type Db, payCycle, profile } from "@spendid/db";
import {
	addDays,
	type CycleStatus,
	daysInclusive,
	draftsUntil,
	type PeriodKind,
} from "@spendid/shared";
import { and, desc, eq, gte, lte } from "drizzle-orm";

/** The period the plan's numbers cover, in the person's own days (end included). */
export interface PeriodBounds {
	kind: PeriodKind;
	today: string;
	start: string;
	end: string;
	/** The day after `end`, for "before this day" queries. */
	nextStart: string;
	days: number;
	/** Days left, today included (at least 1). */
	daysLeft: number;
	/** The cycle's salary; for the calendar month, the profile's monthly income. */
	incomeMinor: number | null;
	cycleId: string | null;
	status: CycleStatus | null;
}

type CycleRow = { id: string; startsOn: string; endsOn: string; incomeMinor: number; status: CycleStatus };

/** Today (YYYY-MM-DD) in `timeZone`. */
export function localDay(timeZone: string, at: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

/** The calendar month around `today`. */
export function calendarMonth(today: string, incomeMinor: number | null): PeriodBounds {
	const start = `${today.slice(0, 8)}01`;
	const [y, m] = today.split("-").map(Number) as [number, number];
	const nextStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
	const end = addDays(nextStart, -1);
	return { kind: "month", today, start, end, nextStart, days: daysInclusive(start, end), daysLeft: daysInclusive(today, end), incomeMinor, cycleId: null, status: null };
}

export function cycleBounds(today: string, row: CycleRow): PeriodBounds {
	return {
		kind: "cycle",
		today,
		start: row.startsOn,
		end: row.endsOn,
		nextStart: addDays(row.endsOn, 1),
		days: daysInclusive(row.startsOn, row.endsOn),
		daysLeft: daysInclusive(today, row.endsOn),
		incomeMinor: row.incomeMinor,
		cycleId: row.id,
		status: row.status,
	};
}

const cycleColumns = {
	id: payCycle.id,
	startsOn: payCycle.startsOn,
	endsOn: payCycle.endsOn,
	incomeMinor: payCycle.incomeMinor,
	status: payCycle.status,
};

async function covering(db: Db, userId: string, today: string): Promise<CycleRow | null> {
	const [row] = await db
		.select(cycleColumns)
		.from(payCycle)
		.where(and(eq(payCycle.userId, userId), lte(payCycle.startsOn, today), gte(payCycle.endsOn, today)))
		.limit(1);
	return row ?? null;
}

/** Drafts cycles after the last one until one covers today. One person at a time (row lock). */
async function draftUpTo(db: Db, userId: string, today: string): Promise<CycleRow | null> {
	return db.transaction(async (tx) => {
		await tx.select({ id: profile.userId }).from(profile).where(eq(profile.userId, userId)).for("update");
		const found = await covering(tx as unknown as Db, userId, today);
		if (found) return found;
		const [last] = await tx.select(cycleColumns).from(payCycle).where(eq(payCycle.userId, userId)).orderBy(desc(payCycle.startsOn)).limit(1);
		if (!last || last.endsOn >= today) return null;
		const drafts = draftsUntil(last, today);
		const made = await tx
			.insert(payCycle)
			.values(drafts.map((d) => ({ userId, ...d, incomeMinor: last.incomeMinor, status: "draft" as const })))
			.returning(cycleColumns);
		return made.at(-1) ?? null;
	});
}

/** The current period: the cycle covering today (drafting it if the last one ended), or the calendar month. */
export async function periodBounds(db: Db, userId: string, at: Date = new Date()): Promise<PeriodBounds> {
	const [p] = await db
		.select({ period: profile.period, timeZone: profile.timeZone, incomeMinor: profile.monthlyIncomeMinor })
		.from(profile)
		.where(eq(profile.userId, userId))
		.limit(1);
	const today = localDay(p?.timeZone ?? "UTC", at);
	const income = p?.incomeMinor ?? null;
	if (p?.period !== "cycle") return calendarMonth(today, income);
	const current = (await covering(db, userId, today)) ?? (await draftUpTo(db, userId, today));
	return current ? cycleBounds(today, current) : calendarMonth(today, income);
}

/** The period just before `bounds`: the previous cycle, else the previous calendar month. */
export async function previousPeriod(
	db: Db,
	userId: string,
	bounds: PeriodBounds,
): Promise<{ kind: PeriodKind; start: string; end: string }> {
	if (bounds.kind === "cycle") {
		const [row] = await db
			.select({ startsOn: payCycle.startsOn, endsOn: payCycle.endsOn })
			.from(payCycle)
			.where(and(eq(payCycle.userId, userId), eq(payCycle.endsOn, addDays(bounds.start, -1))))
			.limit(1);
		if (row) return { kind: "cycle", start: row.startsOn, end: row.endsOn };
	}
	const lastMonth = calendarMonth(addDays(`${bounds.today.slice(0, 8)}01`, -1), null);
	return { kind: "month", start: lastMonth.start, end: lastMonth.end };
}
```

Note: `previousPeriod` for a calendar user uses the month before `today`'s month; for a cycle user with no earlier cycle it falls back the same way (spec: before the first cycle, history is calendar months).

- [ ] **Step 4: Run to see them pass**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money/period.integration.test.ts'`
Expected: PASS (all, including the parallel-drafting test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/money/period.ts apps/api/src/modules/money/period.integration.test.ts
git commit -m "feat: one period resolver that drafts the next cycle

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 4: The summary follows the period (bills, goals, daily spending, preview core)

**Files:**
- Modify: `packages/shared/src/recurring.ts` (`billsStillDue` takes a window), `packages/shared/src/recurring.test.ts`
- Modify: `apps/api/src/modules/insights/charges.ts` (`recurringFor` takes an optional window)
- Modify: `packages/shared/src/transactions.ts` (`SummarySchema` gets `period`, `dailyMinor`)
- Modify: `apps/api/src/modules/money/summary.service.ts`
- Test: `apps/api/src/modules/money/money.integration.test.ts` (new cases), `packages/shared/src/recurring.test.ts`

**Interfaces:**
- Consumes: Task 3 `periodBounds`, `PeriodBounds`, `calendarMonth`, `cycleBounds`; Task 1 `goalCycleNeeded`.
- Produces:
  - `billsStillDue(recurring: Recurring[], from: string, to: string)` (was `(recurring, today, monthEnd)`)
  - `recurringFor(db, userId, window?: { today: string; start: string; end: string })`
  - `Summary.period: Period`, `Summary.dailyMinor: number[]` (spending per day from `period.start` to today, today included)
  - `SummaryService.forUser(userId: string, at?: Date): Promise<Summary>`
  - `SummaryService.forBounds(userId: string, bounds: PeriodBounds, method: BudgetMethod | null): Promise<Summary>` (used by the preview in Task 5)
  - `monthBounds` stays exported, unchanged, for calendar-only callers (insights, subscriptions).

- [ ] **Step 1: Write the failing tests**

In `packages/shared/src/recurring.test.ts`, replace each `billsStillDue(x, today, monthEnd)` call with `billsStillDue(x, \`${today.slice(0, 8)}01\`, monthEnd)` (same behaviour for calendar months), and add:

```ts
	it("counts bills due inside a cycle that crosses a month", () => {
		const bill = { merchant: "TNB", merchantKey: "tnb", categoryId: "c", cadence: "monthly", amountMinor: 12_000, monthlyMinor: 12_000, lastDay: "2026-10-05", count: 3, billLike: true } as Recurring;
		// Next TNB is 5 Nov: inside 29 Oct → 28 Nov, outside 1 → 31 Oct.
		expect(billsStillDue([bill], "2026-10-29", "2026-11-28").minor).toBe(12_000);
		expect(billsStillDue([bill], "2026-10-01", "2026-10-31").minor).toBe(0);
	});
```

(Use the `Recurring` fields exactly as the existing tests in that file build them; copy one existing fixture and change `lastDay`/`amountMinor`.)

In `apps/api/src/modules/money/money.integration.test.ts`, add `payCycle, profile, transaction` to the `@spendid/db` import and append:

```ts
	describe("on a cycle", () => {
		let ali: string;
		const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
		const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
		const noonKl = (d: string) => new Date(`${d}T04:00:00Z`);

		beforeAll(async () => {
			ali = await createPerson(db, { incomeMinor: 999_999 });
			await db.update(profile).set({ period: "cycle", budgetMethod: "pay_yourself_first" }).where(eq(profile.userId, ali));
			await db.insert(payCycle).values({ userId: ali, startsOn: day(-3), endsOn: day(27), incomeMinor: 450_000 });
			await call(ali, "PUT", "/transfers", [{ name: "ASB", amountMinor: 50_000 }]);
			const row = (minor: number, d: string, deleted = false) => ({
				userId: ali, categoryId: food.id, merchant: "Kedai", amountMinor: minor, currency: "MYR",
				homeAmountMinor: minor, homeCurrency: "MYR", occurredAt: noonKl(d), deletedAt: deleted ? new Date() : null,
			});
			await db.insert(transaction).values([
				row(7_000, day(-4)), // the day before the cycle: not counted
				row(1_250, day(-3)), // first day of the cycle
				row(2_000, day(-1)),
				row(3_000, day(-1), true), // deleted: never counted
				row(500, today),
			]);
		});

		it("cycle totals match a hand calculation", async () => {
			const { body } = await call<Summary>(ali, "GET", "/summary");
			const s = body.data;
			expect(s.period).toMatchObject({ kind: "cycle", start: day(-3), end: day(27), days: 31, status: "set" });
			expect(s.incomeMinor).toBe(450_000);
			expect(s.reservedMinor).toBe(50_000);
			expect(s.monthSpentMinor).toBe(1_250 + 2_000 + 500);
			expect(s.daysLeft).toBe(28);
			expect(s.dailyMinor).toEqual([1_250, 0, 2_000, 500]);
			expect(s.safe.leftThisMonthMinor).toBe(450_000 - 50_000 - s.bills.minor - 3_750);
		});

		it("keeps the calendar month for everyone else", async () => {
			const { body } = await call<Summary>(maya, "GET", "/summary");
			expect(body.data.period).toMatchObject({ kind: "month", start: `${today.slice(0, 8)}01`, status: null });
			expect(body.data.dailyMinor).toHaveLength(Number(today.slice(8, 10)));
		});
	});
```

Note for the implementer: the `day(-3)` cycle keeps today inside a 31-day cycle whatever date the test runs on, and `day(-4)` is always outside it.

- [ ] **Step 2: Run to see them fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd packages/shared && pnpm vitest run src/recurring.test.ts' && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money/money.integration.test.ts'`
Expected: FAIL (`billsStillDue` window test, and `s.period` undefined).

- [ ] **Step 3: Bills due inside a window**

In `packages/shared/src/recurring.ts` replace `billsStillDue`:

```ts
/**
 * Bills still expected in a period: every upcoming (or late, not yet seen) occurrence from `from`
 * to `to` (both included). A bill already charged in the period has moved its next date past
 * it, so it isn't counted twice.
 */
export function billsStillDue(
	recurring: Recurring[],
	from: string,
	to: string,
): {
	minor: number;
	items: { merchant: string; day: string; amountMinor: number }[];
} {
	const items: { merchant: string; day: string; amountMinor: number }[] = [];
	for (const r of recurring) {
		for (let n = 1; n <= 6; n++) {
			const day = addCadence(r.lastDay, r.cadence, n);
			if (day > to) break;
			if (day >= from) items.push({ merchant: r.merchant, day, amountMinor: r.amountMinor });
		}
	}
	items.sort((a, b) => a.day.localeCompare(b.day));
	return { minor: items.reduce((s, i) => s + i.amountMinor, 0), items };
}
```

In `apps/api/src/modules/insights/charges.ts` change `recurringFor`:

```ts
/** Subscriptions and bills, plus what's still due in `window` (default: this calendar month). */
export async function recurringFor(
	db: Db,
	userId: string,
	window?: { today: string; start: string; end: string },
): Promise<RecurringOverview> {
	const { currency, timeZone } = await homeOf(db, userId);
	const [charges, bounds] = await Promise.all([
		loadCharges(db, userId, timeZone),
		monthBounds(db, timeZone),
	]);
	const today = window?.today ?? bounds.today;
	const start = window?.start ?? bounds.monthStart;
	const end =
		window?.end ??
		new Date(Date.parse(`${bounds.nextMonth}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
```

then use `today` where it used `bounds.today` (in `detectRecurring(charges, today)`), delete the old `monthEnd` computation, and finish with:

```ts
		billsDue: withSubscriptions(billsStillDue(found, start, end), subs, today, end),
```

- [ ] **Step 4: Summary schema**

In `packages/shared/src/transactions.ts` add `import { PeriodSchema } from "./cycle";` and in `SummarySchema`, after `method`:

```ts
	/** What every number below covers: the calendar month or the person's cycle. */
	period: PeriodSchema,
```

and after `monthSpentMinor`:

```ts
	/** Spending per day from the period's first day to today (today last). */
	dailyMinor: z.array(z.number()),
```

Update the field comments that say "this month" to say "this period" (`daysLeft`, `monthSpentMinor`, `bills`). Field names stay, so nothing else breaks.

- [ ] **Step 5: Summary service per period**

In `apps/api/src/modules/money/summary.service.ts`:
- import `goalCycleNeeded`, `daysInclusive`, `addDays`, `type BudgetMethod` from `@spendid/shared` and `{ type PeriodBounds, periodBounds }` from `./period`.
- Replace `createSummaryService` with:

```ts
/** Everything the home screen needs in one call, for the current period. */
export function createSummaryService(db: Db) {
	async function forBounds(userId: string, bounds: PeriodBounds, method: BudgetMethod | null): Promise<Summary> {
		const [p] = await db.select().from(profile).where(eq(profile.userId, userId)).limit(1);
		const timeZone = p?.timeZone ?? "UTC";
		const homeCurrency = p?.homeCurrency ?? "MYR";
		const incomeMinor = bounds.incomeMinor;

		const localDay = sql`(${transaction.occurredAt} at time zone ${timeZone})::date`;
		const inPeriod = and(
			eq(transaction.userId, userId),
			isNull(transaction.deletedAt),
			onLocalDays(transaction.occurredAt, timeZone, bounds.start, bounds.nextStart),
		);

		const [totals, byCategory, byDay, todayRows, goals, recurring, transfers] = await Promise.all([
			db
				.select({
					before: sql<string>`coalesce(sum(${transaction.homeAmountMinor}) filter (where ${localDay} < ${bounds.today}::date), 0)`,
					today: sql<string>`coalesce(sum(${transaction.homeAmountMinor}) filter (where ${localDay} = ${bounds.today}::date), 0)`,
				})
				.from(transaction)
				.where(inPeriod),
			db
				.select({ categoryId: transaction.categoryId, spentMinor: sql<string>`sum(${transaction.homeAmountMinor})` })
				.from(transaction)
				.where(inPeriod)
				.groupBy(transaction.categoryId),
			db
				.select({ day: sql<string>`${localDay}::text`, minor: sql<string>`sum(${transaction.homeAmountMinor})` })
				.from(transaction)
				.where(and(inPeriod, sql`${localDay} <= ${bounds.today}::date`))
				.groupBy(localDay),
			db
				.select()
				.from(transaction)
				.where(and(inPeriod, sql`${localDay} = ${bounds.today}::date`))
				.orderBy(desc(transaction.occurredAt)),
			db
				.select({ targetMinor: goal.targetMinor, savedMinor: goal.savedMinor, targetDate: goal.targetDate })
				.from(goal)
				.where(and(eq(goal.userId, userId), isNull(goal.archivedAt))),
			recurringFor(db, userId, { today: bounds.today, start: bounds.start, end: bounds.end }),
			db
				.select({ name: monthlyTransfer.name, amountMinor: monthlyTransfer.amountMinor })
				.from(monthlyTransfer)
				.where(eq(monthlyTransfer.userId, userId))
				.orderBy(asc(monthlyTransfer.position), asc(monthlyTransfer.createdAt)),
		]);

		const spentBeforeTodayMinor = Number(totals[0]?.before ?? 0);
		const spentTodayMinor = Number(totals[0]?.today ?? 0);
		const goalsMinor = goals.reduce(
			(sum, g) =>
				sum +
				(bounds.kind === "cycle"
					? goalCycleNeeded(g, bounds.start, bounds.days)
					: goalMonthlyNeeded(g, bounds.today)),
			0,
		);
		const reservedMinor = reservedSavings({
			incomeMinor,
			method,
			goalsMonthlyMinor: goalsMinor,
			transfersMinor: transfers.reduce((sum, t) => sum + t.amountMinor, 0),
		});
		const spentOn = new Map(byDay.map((d) => [d.day, Number(d.minor)]));
		const dailyMinor = Array.from(
			{ length: daysInclusive(bounds.start, bounds.today) },
			(_, i) => spentOn.get(addDays(bounds.start, i)) ?? 0,
		);

		return {
			homeCurrency,
			method,
			period: { kind: bounds.kind, start: bounds.start, end: bounds.end, days: bounds.days, cycleId: bounds.cycleId, status: bounds.status },
			incomeMinor,
			reservedMinor,
			// Kept when switching plans, but only counted while this plan is on.
			transfers: method === "pay_yourself_first" ? transfers : [],
			daysLeft: bounds.daysLeft,
			monthSpentMinor: spentBeforeTodayMinor + spentTodayMinor,
			dailyMinor,
			safe: computeSafeToSpend({
				incomeMinor,
				reservedMinor,
				billsDueMinor: recurring.billsDue.minor,
				spentBeforeTodayMinor,
				spentTodayMinor,
				daysLeft: bounds.daysLeft,
			}),
			today: todayRows.map(toDto),
			byCategory: byCategory.map((c) => ({ categoryId: c.categoryId, spentMinor: Number(c.spentMinor) })),
			bills: recurring.billsDue,
		};
	}

	return {
		forBounds,
		async forUser(userId: string, at?: Date): Promise<Summary> {
			const [p] = await db.select({ method: profile.budgetMethod }).from(profile).where(eq(profile.userId, userId)).limit(1);
			return forBounds(userId, await periodBounds(db, userId, at), p?.method ?? null);
		},
	};
}
```

Keep `monthBounds` and `MonthBounds` as they are (insights and subscriptions still use them).

- [ ] **Step 6: Run the tests**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd packages/shared && pnpm vitest run' && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money src/modules/insights'`
Expected: PASS, including every existing money test (calendar people unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/api/src/modules/money apps/api/src/modules/insights/charges.ts
git commit -m "feat: home numbers follow the person's cycle

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 5: Plan setup service and routes

**Files:**
- Create: `apps/api/src/http/field-error.ts`
- Create: `apps/api/src/modules/money/plan-setup.service.ts`
- Modify: `apps/api/src/modules/money/money.routes.ts`, `apps/api/src/server.ts`
- Test: `apps/api/src/modules/money/plan-setup.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 `checkCycle`, `PlanSetupInputSchema`, `PlanSetup`, `PlanPreview`; Task 3 `periodBounds`, `localDay`, `calendarMonth`, `cycleBounds`; Task 4 `SummaryService.forBounds`.
- Produces:
  - `fieldError(field: string, message: string): ZodError` (400 with `fields[field] = message`)
  - `createPlanSetupService(db: Db, summary: SummaryService)` → `{ get(userId): Promise<PlanSetup>; save(userId, raw: unknown): Promise<PlanSetup>; confirm(userId): Promise<PlanSetup>; preview(userId, raw: unknown): Promise<PlanPreview> }`
  - Routes (member only): `GET /api/plan/setup`, `PUT /api/plan/setup`, `POST /api/plan/setup/preview`, `POST /api/plan/cycle/confirm`
  - `MoneyDeps.planSetup?: PlanSetupService`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/money/plan-setup.integration.test.ts
import { createDb, payCycle, profile } from "@spendid/db";
import type { PlanPreview, PlanSetup, Summary } from "@spendid/shared";
import { addDays } from "@spendid/shared";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { buildApp } from "../../app";
import type { SessionLookup } from "../../auth/guards";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "./categories.repository";
import { createFxRepository } from "./fx.repository";
import { createPlanRepository } from "./plan.repository";
import { createPlanSetupService } from "./plan-setup.service";
import { createSummaryService } from "./summary.service";
import { createTransactionRepository } from "./transactions.repository";
import { createTransactionService } from "./transactions.service";

const url = testDbUrl();

describe.skipIf(!url)("plan setup API (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 4);
	const db = database.db;
	let app: FastifyInstance;
	let admin: string;
	const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
	const day = (n: number) => addDays(today, n);

	const session: SessionLookup = async (headers) => {
		const id = headers.get("x-test-user");
		return id ? { id, name: "T", email: "t@test.local", emailVerified: true, role: id === admin ? "admin" : "user" } : null;
	};
	const call = async <T>(userId: string, method: "GET" | "PUT" | "POST", path: string, payload?: object) => {
		const res = await app.inject({ method, url: `/api${path}`, headers: { "x-test-user": userId }, payload });
		return { status: res.statusCode, body: res.json() as { success: boolean; data: T; error?: string; fields?: Record<string, string> } };
	};
	const cycle = (startsOn: string, endsOn: string, incomeMinor = 450_000, method: string | null = "envelope") => ({
		period: "cycle", cycle: { startsOn, endsOn }, incomeMinor, method,
	});
	const rows = async (userId: string) =>
		(await db.select().from(payCycle).where(eq(payCycle.userId, userId)).orderBy(asc(payCycle.startsOn))).map((r) => [r.startsOn, r.endsOn, r.status]);

	beforeAll(async () => {
		await seedCategories(db);
		admin = await createPerson(db, { role: "admin" });
		const categories = createCategoryRepository(db);
		const transactions = createTransactionRepository(db);
		const summary = createSummaryService(db);
		app = await buildApp({
			checks: { database: database.ping, redis: async () => true },
			money: {
				session, categories, transactions,
				transactionService: createTransactionService({ db, transactions, categories, fx: createFxRepository(db) }),
				summary, plan: createPlanRepository(db),
				planSetup: createPlanSetupService(db, summary),
			},
		});
	});
	afterAll(async () => {
		await app?.close();
		await database.close();
	});

	it("starts on the calendar month with the profile's income", async () => {
		const maya = await createPerson(db);
		const { body } = await call<PlanSetup>(maya, "GET", "/plan/setup");
		expect(body.data).toEqual({ period: "month", cycle: null, incomeMinor: 600_000, method: "envelope", today });
	});

	it("saves a cycle, salary and style in one go", async () => {
		const maya = await createPerson(db);
		const { status, body } = await call<PlanSetup>(maya, "PUT", "/plan/setup", cycle(day(-2), day(28), 512_300, "pay_yourself_first"));
		expect(status).toBe(200);
		expect(body.data).toMatchObject({ period: "cycle", cycle: { startsOn: day(-2), endsOn: day(28), status: "set" }, incomeMinor: 512_300, method: "pay_yourself_first" });
		const s = await call<Summary>(maya, "GET", "/summary");
		expect(s.body.data.period).toMatchObject({ kind: "cycle", start: day(-2) });
		expect(s.body.data.incomeMinor).toBe(512_300);
	});

	it("edits the current cycle and moves the previous cycle's end", async () => {
		const maya = await createPerson(db);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, maya));
		await db.insert(payCycle).values([
			{ userId: maya, startsOn: day(-32), endsOn: day(-3), incomeMinor: 1 },
			{ userId: maya, startsOn: day(-2), endsOn: day(28), incomeMinor: 1 },
		]);
		const { status } = await call(maya, "PUT", "/plan/setup", cycle(day(-5), day(25)));
		expect(status).toBe(200);
		expect(await rows(maya)).toEqual([
			[day(-32), day(-6), "set"],
			[day(-5), day(25), "set"],
		]);
	});

	it("refuses bad ranges with a message on the field", async () => {
		const maya = await createPerson(db);
		const short = await call(maya, "PUT", "/plan/setup", cycle(day(0), day(3)));
		expect(short.status).toBe(400);
		expect(short.body.fields).toEqual({ "cycle.endsOn": "A cycle is 7 to 62 days." });
		const future = await call(maya, "PUT", "/plan/setup", cycle(day(1), day(30)));
		expect(future.body.fields).toEqual({ "cycle.startsOn": "Today has to be inside your cycle." });
		const noDates = await call(maya, "PUT", "/plan/setup", { period: "cycle", cycle: null, incomeMinor: 1, method: null });
		expect(noDates.body.fields).toEqual({ "cycle.startsOn": "Pick the start and end dates." });
		expect(await rows(maya)).toEqual([]);
	});

	it("refuses a start before the last cycle began", async () => {
		const maya = await createPerson(db);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, maya));
		await db.insert(payCycle).values([
			{ userId: maya, startsOn: day(-10), endsOn: day(-3), incomeMinor: 1 },
			{ userId: maya, startsOn: day(-2), endsOn: day(28), incomeMinor: 1 },
		]);
		const r = await call(maya, "PUT", "/plan/setup", cycle(day(-12), day(18)));
		expect(r.body.fields).toEqual({ "cycle.startsOn": "This starts before your last cycle began." });
	});

	it("switches back to the calendar month and keeps finished cycles", async () => {
		const maya = await createPerson(db);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, maya));
		await db.insert(payCycle).values([
			{ userId: maya, startsOn: day(-32), endsOn: day(-3), incomeMinor: 1 },
			{ userId: maya, startsOn: day(-2), endsOn: day(28), incomeMinor: 1 },
		]);
		const { body } = await call<PlanSetup>(maya, "PUT", "/plan/setup", { period: "month", cycle: null, incomeMinor: 480_000, method: "fifty_thirty_twenty" });
		expect(body.data).toMatchObject({ period: "month", cycle: null, incomeMinor: 480_000, method: "fifty_thirty_twenty" });
		expect(await rows(maya)).toEqual([[day(-32), day(-3), "set"]]);
	});

	it("confirms a draft cycle once", async () => {
		const maya = await createPerson(db);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, maya));
		await db.insert(payCycle).values({ userId: maya, startsOn: day(-31), endsOn: day(-1), incomeMinor: 420_000 });
		const before = await call<PlanSetup>(maya, "GET", "/plan/setup");
		expect(before.body.data.cycle).toMatchObject({ startsOn: day(0), endsOn: day(30), status: "draft" });
		const ok = await call<PlanSetup>(maya, "POST", "/plan/cycle/confirm");
		expect(ok.body.data.cycle?.status).toBe("set");
		const again = await call(maya, "POST", "/plan/cycle/confirm");
		expect(again.status).toBe(409);
	});

	it("previews the daily amount without saving", async () => {
		const maya = await createPerson(db);
		const { body } = await call<PlanPreview>(maya, "POST", "/plan/setup/preview", cycle(day(0), day(29), 300_000, null));
		// No spending, no goals, no plan style: 300,000 over 30 days.
		expect(body.data).toEqual({ status: "ok", dailyAllowanceMinor: 10_000, days: 30, daysLeft: 30 });
		expect(await rows(maya)).toEqual([]);
	});

	it("never lets an admin in", async () => {
		const r = await call(admin, "GET", "/plan/setup");
		expect([401, 403]).toContain(r.status);
	});
});
```

Note for the implementer: the preview expectation assumes a fresh person with no subscriptions or detected bills; `computeSafeToSpend` divides what's left by days left, so check its rounding in `packages/shared/src/safe-to-spend.ts` and keep amounts that divide evenly.

- [ ] **Step 2: Run to see them fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money/plan-setup.integration.test.ts'`
Expected: FAIL, `Cannot find module './plan-setup.service'`.

- [ ] **Step 3: Field errors**

```ts
// apps/api/src/http/field-error.ts
import { ZodError } from "zod";

/** A 400 that names the field, like a validation error ("cycle.startsOn"). */
export function fieldError(field: string, message: string): ZodError {
	return new ZodError([{ code: "custom", path: field.split("."), message, input: undefined }]);
}
```

- [ ] **Step 4: The service**

```ts
// apps/api/src/modules/money/plan-setup.service.ts
import { type Db, payCycle, profile } from "@spendid/db";
import {
	checkCycle,
	type CycleRange,
	type PlanPreview,
	type PlanSetup,
	PlanSetupInputSchema,
} from "@spendid/shared";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { AppError, notFound } from "../../http/app-error";
import { fieldError } from "../../http/field-error";
import { calendarMonth, cycleBounds, localDay, periodBounds } from "./period";
import type { SummaryService } from "./summary.service";

/** The "Your plan" sheet: period, cycle, salary and style, saved together. */
export function createPlanSetupService(db: Db, summary: SummaryService) {
	async function get(userId: string): Promise<PlanSetup> {
		const bounds = await periodBounds(db, userId);
		const [p] = await db.select({ period: profile.period, method: profile.budgetMethod }).from(profile).where(eq(profile.userId, userId)).limit(1);
		if (!p) throw notFound("Profile");
		return {
			period: bounds.kind,
			cycle: bounds.cycleId && bounds.status ? { id: bounds.cycleId, startsOn: bounds.start, endsOn: bounds.end, status: bounds.status } : null,
			incomeMinor: bounds.incomeMinor,
			method: p.method,
			today: bounds.today,
		};
	}

	/** The cycle before `current` (editing), or the latest cycle (a new run). */
	async function previousOf(tx: Db, userId: string, current: { startsOn: string } | null): Promise<CycleRange | null> {
		const [row] = await tx
			.select({ startsOn: payCycle.startsOn, endsOn: payCycle.endsOn, id: payCycle.id })
			.from(payCycle)
			.where(and(eq(payCycle.userId, userId), current ? lt(payCycle.startsOn, current.startsOn) : undefined))
			.orderBy(desc(payCycle.startsOn))
			.limit(1);
		return row ?? null;
	}

	async function save(userId: string, raw: unknown): Promise<PlanSetup> {
		const input = PlanSetupInputSchema.parse(raw);
		await periodBounds(db, userId); // drafts a missing current cycle first, so "current" is always found
		await db.transaction(async (txRaw) => {
			const tx = txRaw as unknown as Db;
			const [p] = await tx.select().from(profile).where(eq(profile.userId, userId)).for("update");
			if (!p) throw notFound("Profile");
			const today = localDay(p.timeZone);

			if (input.period === "month") {
				// The current cycle (and any draft) ends here; finished cycles stay as history.
				await tx.delete(payCycle).where(and(eq(payCycle.userId, userId), gte(payCycle.endsOn, today)));
				await tx.update(profile).set({ period: "month", monthlyIncomeMinor: input.incomeMinor, budgetMethod: input.method }).where(eq(profile.userId, userId));
				return;
			}

			const range = input.cycle as CycleRange;
			const [current] =
				p.period === "cycle"
					? await tx
							.select({ id: payCycle.id, startsOn: payCycle.startsOn })
							.from(payCycle)
							.where(and(eq(payCycle.userId, userId), gte(payCycle.endsOn, today)))
							.orderBy(desc(payCycle.startsOn))
							.limit(1)
					: [];
			const previous = await previousOf(tx, userId, current ?? null);
			const check = checkCycle({ range, today, previous, joinPrevious: Boolean(current) });
			if (!check.ok) throw fieldError(`cycle.${check.field}`, check.message);

			if (previous && check.previousEndsOn)
				await tx.update(payCycle).set({ endsOn: check.previousEndsOn }).where(and(eq(payCycle.userId, userId), eq(payCycle.startsOn, previous.startsOn)));
			const values = { startsOn: range.startsOn, endsOn: range.endsOn, incomeMinor: input.incomeMinor, status: "set" as const };
			if (current) await tx.update(payCycle).set(values).where(eq(payCycle.id, current.id));
			else await tx.insert(payCycle).values({ userId, ...values });
			await tx.update(profile).set({ period: "cycle", budgetMethod: input.method }).where(eq(profile.userId, userId));
		});
		return get(userId);
	}

	async function confirm(userId: string): Promise<PlanSetup> {
		const bounds = await periodBounds(db, userId);
		if (bounds.status !== "draft" || !bounds.cycleId) throw new AppError(409, "There's no new cycle to confirm.");
		await db.update(payCycle).set({ status: "set" }).where(and(eq(payCycle.id, bounds.cycleId), eq(payCycle.userId, userId)));
		return get(userId);
	}

	async function preview(userId: string, raw: unknown): Promise<PlanPreview> {
		const input = PlanSetupInputSchema.parse(raw);
		const [p] = await db.select({ timeZone: profile.timeZone }).from(profile).where(eq(profile.userId, userId)).limit(1);
		const today = localDay(p?.timeZone ?? "UTC");
		let bounds = calendarMonth(today, input.incomeMinor);
		if (input.period === "cycle") {
			const range = input.cycle as CycleRange;
			const check = checkCycle({ range, today, previous: null, joinPrevious: false });
			if (!check.ok) throw fieldError(`cycle.${check.field}`, check.message);
			bounds = cycleBounds(today, { id: "00000000-0000-7000-8000-000000000000", ...range, incomeMinor: input.incomeMinor, status: "set" });
		}
		const s = await summary.forBounds(userId, bounds, input.method);
		return { status: s.safe.status, dailyAllowanceMinor: s.safe.dailyAllowanceMinor, days: bounds.days, daysLeft: bounds.daysLeft };
	}

	return { get, save, confirm, preview };
}

export type PlanSetupService = ReturnType<typeof createPlanSetupService>;
```

- [ ] **Step 5: Routes and wiring**

In `apps/api/src/modules/money/money.routes.ts`: import `type PlanSetupService` from `./plan-setup.service`; add to `MoneyDeps`:

```ts
	/** The "Your plan" sheet (period, cycle, salary, style). */
	planSetup?: PlanSetupService;
```

and after the `/transfers` routes:

```ts
	if (deps.planSetup) {
		const setup = deps.planSetup;
		app.get("/plan/setup", async (req) => ({ success: true, data: await setup.get(uid(req)) }));
		app.put("/plan/setup", async (req) => ({ success: true, data: await setup.save(uid(req), req.body) }));
		app.post("/plan/setup/preview", async (req) => ({ success: true, data: await setup.preview(uid(req), req.body) }));
		app.post("/plan/cycle/confirm", async (req) => ({ success: true, data: await setup.confirm(uid(req)) }));
	}
```

In `apps/api/src/server.ts`, import `createPlanSetupService` and pass `planSetup: createPlanSetupService(database.db, summary)` in the `money` deps (use the same summary service instance the money deps already use; if it's created inline, hoist it to a `const summaryService = createSummaryService(database.db)` first and use it in both places).

- [ ] **Step 6: Run the tests**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/http/field-error.ts apps/api/src/modules/money apps/api/src/server.ts
git commit -m "feat: save period, cycle, salary and style in one request

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 6: Goals, budget alerts and family view follow the period

**Files:**
- Modify: `apps/api/src/modules/money/plan.repository.ts`
- Modify: `apps/api/src/notify/alerts.ts`
- Modify: `apps/api/src/modules/family/shared-view.ts`, `packages/shared/src/family.ts` (`SharedView.month` gets `from`, `to`, `kind`)
- Test: `apps/api/src/modules/money/money.integration.test.ts`, `apps/api/src/notify/notify.integration.test.ts`, `apps/api/src/modules/family/family.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `periodBounds`, `previousPeriod`; Task 1 `goalCycleNeeded`.
- Produces: `Goal.monthlyNeededMinor` now means "needed per period" (name kept); `SharedView.month: { spentMinor; lastMonthMinor; count; kind: PeriodKind; from: string; to: string } | null`; budget-alert dedupe key `${categoryId}:${bounds.start}:${step}`.

- [ ] **Step 1: Write the failing tests**

Add to the "on a cycle" block in `money.integration.test.ts`:

```ts
		it("a goal's share is per cycle", async () => {
			const target = day(27 + 31 * 2); // three cycles away
			await call(ali, "POST", "/goals", { name: "Trip", emoji: "✈️", targetMinor: 90_000, targetDate: target });
			const goals = await call<{ name: string; monthlyNeededMinor: number }[]>(ali, "GET", "/goals");
			expect(goals.body.data.find((g) => g.name === "Trip")?.monthlyNeededMinor).toBe(30_000);
		});
```

(`GoalInputSchema` may need `savedMinor`; send whatever the existing goal tests in this file send.)

In `apps/api/src/notify/notify.integration.test.ts` add `payCycle` to the `@spendid/db` import, `addDays` from `@spendid/shared`, and after "alerts at 80% and 100% of a budget, once each":

```ts
	it("budget alerts follow the cycle", async () => {
		const cy = await createPerson(db);
		const today = localParts("Asia/Kuala_Lumpur").date;
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, cy));
		await db.insert(payCycle).values({ userId: cy, startsOn: addDays(today, -3), endsOn: addDays(today, 27), incomeMinor: 450_000 });
		await db.insert(budget).values({ userId: cy, categoryId: food, monthlyLimitMinor: 10_000 });
		const row = (minor: number, merchant: string, occurredAt: Date) => ({
			userId: cy, amountMinor: minor, currency: "MYR", homeAmountMinor: minor, homeCurrency: "MYR", categoryId: food, merchant, occurredAt,
		});
		// RM 50 the day before the cycle doesn't count; RM 85 inside it is 85%.
		await db.insert(transaction).values(row(5_000, "Old", new Date(`${addDays(today, -4)}T04:00:00Z`)));
		const [inside] = await db.insert(transaction).values(row(8_500, "Nasi lemak", new Date())).returning({ id: transaction.id });
		await alerts.afterExpense(cy, inside?.id ?? "");
		const jobs = sent.flatMap((s) => (s.job.type === "notice" && s.job.kind === "budget-alert" ? [s.job] : []));
		expect(jobs.map((j) => j.subject)).toEqual(["Eating out: 80% of your budget used"]);
		expect(jobs[0]?.preview).toContain("with 28 days to go");
		expect(JSON.stringify(jobs[0])).toContain("this cycle's");
	});
```

In `apps/api/src/modules/family/family.integration.test.ts` add `payCycle, profile` to the `@spendid/db` import, `addDays` to the `@spendid/shared` import, and right after "shows only what the level allows, and the owner's preview is identical" (Maya shares at least totals with Adam at that point):

```ts
	it("follows the owner's cycle, with its dates and never the salary", async () => {
		const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
		const start = addDays(today, -2);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, maya));
		await db.insert(payCycle).values([
			{ userId: maya, startsOn: addDays(start, -30), endsOn: addDays(start, -1), incomeMinor: 777_777 },
			{ userId: maya, startsOn: start, endsOn: addDays(start, 30), incomeMinor: 777_777 },
		]);
		try {
			const view = await call<SharedView>(adam, "GET", `/family/people/${maya}/view`);
			expect(view.body.data.month).toMatchObject({ kind: "cycle", from: start, to: addDays(start, 30) });
			expect(JSON.stringify(view.body.data)).not.toContain("777777");
		} finally {
			await db.update(profile).set({ period: "month" }).where(eq(profile.userId, maya));
			await db.delete(payCycle).where(eq(payCycle.userId, maya));
		}
	});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money src/notify src/modules/family'`
Expected: FAIL on the three new cases.

- [ ] **Step 3: Goals per period**

In `plan.repository.ts`: import `goalCycleNeeded` and `{ periodBounds }` from `./period`. Change `goalDto(g, needed: number)` to take the computed need, and in `goals(userId)` (and every method that returns `goalDto`) compute it once per call:

```ts
	async function neededFor(userId: string) {
		const bounds = await periodBounds(db, userId);
		return (g: GoalRow) =>
			bounds.kind === "cycle" ? goalCycleNeeded(g, bounds.start, bounds.days) : goalMonthlyNeeded(g, bounds.today);
	}
```

then `const need = await neededFor(userId); return rows.map((g) => goalDto(g, need(g)));`, and remove `todayIso()`.

- [ ] **Step 4: Alerts per period**

In `alerts.ts`, replace `const bounds = await monthBounds(db, timeZone);` with `const bounds = await periodBounds(db, userId);`, the `onLocalDays(..., bounds.monthStart, bounds.nextMonth)` with `(..., bounds.start, bounds.nextStart)`, and the dedupe key with `` `${categoryId}:${bounds.start}:${step}` `` (one alert per step per period). Copy for cycles:

```ts
				const span = bounds.kind === "cycle" ? "cycle" : "month";
				// body:
				step === 100
					? `You've spent your whole ${limit.name.toLowerCase()} budget for this ${span}. Anything more comes out of the rest of your ${span}.`
					: `You've used 80% of this ${span}'s ${limit.name.toLowerCase()} budget. A little care for the next ${bounds.daysLeft} days keeps you on plan.`,
				// rows: { label: bounds.kind === "cycle" ? "Limit per cycle" : "Monthly limit", ... }
```

Drop the `timeZone` parameter only if nothing else in the function uses it (`onLocalDays` still needs it, so keep it).

- [ ] **Step 5: Family view per period**

In `packages/shared/src/family.ts`, extend the `month` object schema of `SharedView` with `kind: z.enum(PERIOD_KINDS), from: z.iso.date(), to: z.iso.date()` (import `PERIOD_KINDS` from `./cycle`). In `shared-view.ts` replace `monthBounds(db, timeZone)` with `const bounds = await periodBounds(db, ownerId); const before = await previousPeriod(db, ownerId, bounds);`, use `bounds.start`/`bounds.nextStart` for `thisMonth`, `before.start`/`addDays(before.end, 1)` for `lastMonth`, and add `kind: bounds.kind, from: bounds.start, to: bounds.end` to `view.month`. Only dates are shared, never the salary.

In the web family screen that renders `month` (find it with `grep -rln "lastMonthMinor" apps/web/src`), label the figure with `periodLabel(month.kind)` and `cycleDates(...)` from Task 9's `period-words.ts` once Task 9 lands; until then keep the existing label (Task 10 Step 4 does the swap).

- [ ] **Step 6: Run the tests**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/money src/notify src/modules/family'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src packages/shared/src/family.ts
git commit -m "feat: goals, budget alerts and family view follow the cycle

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 7: Reminder on a cycle's last day

**Files:**
- Modify: `apps/api/src/notify/digests.ts`
- Modify: `packages/emails/src/jobs.ts` (`NOTICE_KINDS` gets `"cycle-ending"`), `apps/web/src/features/notices/NoticesBell.tsx` (its icon)
- Test: `apps/api/src/notify/notify.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `periodBounds`.
- Produces: notice kind `cycle-ending`, group `budget`, dedupe key = cycle id; sent in the 9am "daily" digest on the cycle's last day.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/notify/notify.integration.test.ts` (imports from Task 6 already there), after the evening-nudge test:

```ts
	it("reminds a cycle user on the cycle's last day, once, and nobody else", async () => {
		const digests = createDigests({ db, notifier, summary: createSummaryService(db), insights: createInsightsService(db), logError: () => {} });
		const today = localParts("Asia/Kuala_Lumpur").date;
		const cyd = await createPerson(db);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, cyd));
		await db.insert(payCycle).values({ userId: cyd, startsOn: addDays(today, -30), endsOn: today, incomeMinor: 450_000 });
		const early = await createPerson(db);
		await db.update(profile).set({ period: "cycle" }).where(eq(profile.userId, early));
		await db.insert(payCycle).values({ userId: early, startsOn: addDays(today, -3), endsOn: addDays(today, 27), incomeMinor: 450_000 });
		const sam = await createPerson(db);

		for (const id of [cyd, cyd, early, sam]) await digests.cycleEnding(id, today);

		const reminders = sent.filter((s) => s.job.type === "notice" && s.job.kind === "cycle-ending");
		expect(reminders).toHaveLength(1);
		expect(reminders[0]?.job.to).toBe(`${cyd}@test.local`);
	});
```

(`to` is the address field the notice job uses in this file's first test; use the same one.)

- [ ] **Step 2: Run to see it fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/notify'`
Expected: FAIL, `digests.cycleEnding is not a function`.

- [ ] **Step 3: Implement**

In `digests.ts`, import `periodBounds` from `../modules/money/period` and add next to `warranties`:

```ts
	/** On a cycle's last day: check the next one (it starts tomorrow as a draft). */
	async function cycleEnding(userId: string, today: string): Promise<void> {
		const bounds = await periodBounds(db, userId);
		if (bounds.kind !== "cycle" || bounds.end !== today || !bounds.cycleId) return;
		await notifier.notify(userId, {
			kind: "cycle-ending",
			group: "budget",
			dedupeKey: bounds.cycleId,
			build: ({ appUrl }) => ({
				subject: "Your cycle ends today",
				preview: "Tomorrow a new cycle starts with the same dates and salary. Change it if your pay is different.",
				heading: "Your cycle ends today",
				body: "Tomorrow Spendid starts your next cycle with the same length and salary. If your pay day or salary is different this time, change it in a tap.",
				action: "Check my next cycle",
				url: `${appUrl}/app/plan`,
			}),
		});
	}
```

Add `"cycle-ending"` to `NOTICE_KINDS` in `packages/emails/src/jobs.ts` (after `"budget-alert"`), and to the bell's `LOOK` map in `NoticesBell.tsx` as `"cycle-ending": { Icon: CalendarClock, tint: "plum" }` (import `CalendarClock` from `lucide-react`; use a tint name that exists in that map). Return `cycleEnding` from the factory (next to `evening`), and add it to the `daily` jobs in `tick`: `daily: () => [bills(...), subscriptionReminders(...), warranties(...), cycleEnding(p.id, local.date)],`.

- [ ] **Step 4: Run the tests**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/notify'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notify packages/emails/src/jobs.ts apps/web/src/features/notices/NoticesBell.tsx
git commit -m "feat: remind on a cycle's last day

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 8: Ask: "this cycle" and "last cycle"

**Files:**
- Modify: `apps/api/src/modules/ask/tools/period.ts`, `tools/filters.ts`, `tools/context.ts`, `tools/read.ts`, `coverage.ts`, `ask.agent.ts`
- Test: `apps/api/src/modules/ask/coverage.test.ts`, `apps/api/src/modules/ask/ask.accuracy.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `periodBounds`, `previousPeriod`; Task 4 `Summary.period`.
- Produces:
  - `PERIODS` gains `"this_cycle"`, `"last_cycle"`
  - `interface CycleSpans { current: { from: string; to: string } | null; previous: { from: string; to: string } | null }` (in `period.ts`)
  - `periodRange(period, today, cycles?: CycleSpans | null)`
  - `AskContext.cycles?: CycleSpans | null`
  - `coverageProblems({ ..., cycles?: CycleSpans | null })`

- [ ] **Step 1: Write the failing tests**

In `coverage.test.ts`:

```ts
describe("cycles", () => {
	const cycles = { current: { from: "2026-10-29", to: "2026-11-28" }, previous: { from: "2026-09-29", to: "2026-10-28" } };
	it("reads 'this cycle' and 'last cycle' in English and Malay", () => {
		expect(mentionedPeriods("how much did I spend this cycle?")).toEqual(["this_cycle"]);
		expect(mentionedPeriods("berapa saya belanja kitaran lepas")).toEqual(["last_cycle"]);
		expect(mentionedPeriods("spent since payday")).toEqual(["this_cycle"]);
	});
	it("needs the cycle's days, not the calendar month", () => {
		const problems = coverageProblems({
			question: "how much did I spend this cycle?", today: "2026-11-10", categories: [], cycles,
			lookups: [{ from: "2026-11-01", to: "2026-11-10", groupBy: "category" }],
		});
		expect(problems.join(" ")).toContain("this cycle (2026-10-29 to 2026-11-10)");
		expect(coverageProblems({
			question: "how much did I spend this cycle?", today: "2026-11-10", categories: [], cycles,
			lookups: [{ from: "2026-10-29", to: "2026-11-10", groupBy: "category" }],
		})).toEqual([]);
	});
	it("keeps 'this month' as the calendar month for cycle users", () => {
		expect(coverageProblems({
			question: "how much did I spend this month?", today: "2026-11-10", categories: [], cycles,
			lookups: [{ from: "2026-10-29", to: "2026-11-10", groupBy: "category" }],
		}).length).toBeGreaterThan(0);
	});
	it("uses calendar months for 'this cycle' when there is no cycle", () => {
		expect(coverageProblems({
			question: "how much did I spend this cycle?", today: "2026-11-10", categories: [], cycles: null,
			lookups: [{ from: "2026-11-01", to: "2026-11-10", groupBy: "category" }],
		})).toEqual([]);
	});
});
```

In `ask.accuracy.integration.test.ts`, add a second person on a cycle crossing a month, with `today` fixed:

```ts
	describe("on a cycle (27 Feb → 28 Mar 2025, today 10 Mar)", () => {
		const cycles = { current: { from: "2025-02-27", to: "2025-03-28" }, previous: { from: "2025-01-27", to: "2025-02-26" } };
		// Feb 26: 30.00 (last cycle). Feb 27: 12.00. Mar 2: 8.50. Mar 9: 20.00 removed. Mar 10: 4.20.
		// this cycle so far = 24.70; this month (1–10 Mar) = 12.70; last cycle includes 30.00.
		let cyc: string;
		const cycleTools = () => {
			const side: SideChannel = { charts: [], drafts: [], actions: [] };
			const all = createAskTools(
				{ db, summary: createSummaryService(db), plan: createPlanRepository(db) },
				{ userId: cyc, timeZone: KL, homeCurrency: "MYR", categories, today: "2025-03-10", cycles },
				side,
			);
			return async (name: string, input: unknown) => {
				const t = all.find((x) => x.name === name) as unknown as { invoke: (i: unknown) => Promise<string> };
				return JSON.parse(await t.invoke(input));
			};
		};
		beforeAll(async () => {
			cyc = await createPerson(db);
			const food = categories.find((c) => c.slug === "food")?.id ?? "";
			const r = (minor: number, d: string, deleted = false) => ({
				userId: cyc, categoryId: food, merchant: "Kedai", amountMinor: minor, currency: "MYR",
				homeAmountMinor: minor, homeCurrency: "MYR", occurredAt: new Date(`${d}T04:00:00Z`), deletedAt: deleted ? new Date() : null,
			});
			await db.insert(transaction).values([r(3_000, "2025-02-26"), r(1_200, "2025-02-27"), r(850, "2025-03-02"), r(2_000, "2025-03-09", true), r(420, "2025-03-10")]);
		});
		it("this cycle, this month and last cycle are each exact", async () => {
			const run = cycleTools();
			const cycleTotal = await run("spending_totals", { period: "this_cycle", groupBy: "category" });
			const monthTotal = await run("spending_totals", { period: "this_month", groupBy: "category" });
			const lastCycle = await run("spending_totals", { period: "last_cycle", groupBy: "category" });
			expect(cycleTotal.total.amount).toBe(24.7);
			expect(monthTotal.total.amount).toBe(12.7);
			expect(lastCycle.total.amount).toBe(30);
		});
	});
```

(Match the exact output field names `spending_totals` returns in this file's existing March tests, e.g. `total.amount`; adjust the three `expect` lines to them.)

- [ ] **Step 2: Run to see them fail**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/ask/coverage.test.ts src/modules/ask/ask.accuracy.integration.test.ts'`
Expected: FAIL (`this_cycle` isn't a period).

- [ ] **Step 3: Periods**

In `tools/period.ts`: add `"this_cycle", "last_cycle"` to `PERIODS` (after `"last_month"`), and:

```ts
/** The person's cycles as day spans; null when they budget by calendar month. */
export interface CycleSpans {
	current: { from: string; to: string } | null;
	previous: { from: string; to: string } | null;
}
```

Change the signature to `periodRange(period: Period, today: string, cycles?: CycleSpans | null)` and add cases (calendar months when there's no cycle, as the spec says):

```ts
		case "this_cycle":
			return cycles?.current ? { from: cycles.current.from, to: today } : periodRange("this_month", today);
		case "last_cycle":
			return cycles?.previous ?? periodRange("last_month", today);
```

In `tools/context.ts` add to `AskContext`:

```ts
	/** The person's current and previous cycle (null: calendar months). Set by the server. */
	cycles?: CycleSpans | null;
```

In `tools/filters.ts`, `resolveRange(input, ctx: Pick<AskContext, "timeZone" | "today" | "cycles">)` calls `periodRange(input.period, today, ctx.cycles)`.

- [ ] **Step 4: Coverage**

In `coverage.ts`: add to `PERIOD_WORDS` after `last_month`:

```ts
	["this_cycle", /\bthis\s+cycle\b|\bcurrent\s+cycle\b|\bsince\s+(?:my\s+)?pay\s*day\b|\bkitaran\s+ini\b|\bsejak\s+gaji\b/i],
	["last_cycle", /\b(?:last|previous)\s+cycle\b|\bkitaran\s+(?:lepas|lalu)\b/i],
```

`PERIOD_LABEL`: `this_cycle: "this cycle", last_cycle: "last cycle"`; `GRAINS`: `this_cycle: ["day"], last_cycle: ["day"]`. Thread `cycles` through: `spansIn(question, today, cycles)` uses `periodRange(period, today, cycles)`; `coverageProblems` and `spendingCoverage` take `cycles?: CycleSpans | null` and pass it on. Make the transfers message period-neutral: "The question is about transfers, which are part of the plan, not spending. Call budget_overview and answer from its transfers out first, their total and the income left after them (or say the plan has none)."

- [ ] **Step 5: Context, prompt and budget_overview**

In `ask.agent.ts`, after `const categories = ...`:

```ts
		const period = await periodBounds(deps.db, userId);
		const before = period.kind === "cycle" ? await previousPeriod(deps.db, userId, period) : null;
		const cycles: CycleSpans | null =
			period.kind === "cycle"
				? { current: { from: period.start, to: period.end }, previous: before?.kind === "cycle" ? { from: before.start, to: before.end } : null }
				: null;
```

pass `cycles` in the tools context and in the `coverageProblems({ ..., cycles })` call, and add one line to `systemPrompt` (new parameter `periodLine: string`):

```ts
const periodLine = cycles
	? `- Their budget runs by cycle: this cycle is ${cycles.current?.from} to ${cycles.current?.to}${cycles.previous ? `, last cycle was ${cycles.previous.from} to ${cycles.previous.to}` : " (no earlier cycle: before it they used calendar months, so 'last cycle' means last month)"}. "This month" and month names are calendar months; "this cycle", "last cycle", "since payday" use the cycle (period this_cycle / last_cycle). What's left, am I over and safe today come from budget_overview, which covers the cycle; always say the cycle's dates.`
	: `- Their budget runs by calendar month; they have no cycle. If they ask about a cycle, use this_month / last_month and say they budget by calendar month.`;
```

Add `this_cycle, last_cycle` to the period list in the prompt's dates line.

In `tools/read.ts` `budget_overview`: push the lookup for the period, not the calendar month:

```ts
			side.lookups.push(
				{ from: s.period.start, to: today, groupBy: "category" },
				{ from: today, to: today, groupBy: "category" },
			);
```

and return, for cycle users, cycle-named keys so the model never calls them "this month":

```ts
			const cycle = s.period.kind === "cycle";
			const n = (month: string, cycleName: string) => (cycle ? cycleName : month);
			return JSON.stringify({
				currency: cur,
				period: cycle
					? { kind: "cycle", from: s.period.start, to: s.period.end, ...(s.period.status === "draft" ? { note: "drafted by Spendid, not confirmed yet" } : {}) }
					: { kind: "calendar month", from: s.period.start, to: s.period.end },
				budgetStyle: s.method ? (STYLE_NAME[s.method] ?? s.method) : "none chosen yet",
				[n("monthlyIncome", "incomeThisCycle")]: s.incomeMinor === null ? null : major(s.incomeMinor, cur),
				...(s.method === "pay_yourself_first"
					? {
							[n("monthlyTransfersOutFirst", "transfersOutFirstEachCycle")]: s.transfers.map((t) => ({ name: t.name, amount: major(t.amountMinor, cur) })),
							[n("monthlyTransfersTotal", "transfersTotalEachCycle")]: major(s.reservedMinor, cur),
							incomeLeftAfterTransfers: s.incomeMinor === null ? null : major(s.incomeMinor - s.reservedMinor, cur),
						}
					: {
							keptAsideForSavings: major(s.reservedMinor, cur),
							[n("monthlyTransfers", "transfers")]: "none: this plan has no transfers",
						}),
				safeToSpendToday: major(s.safe.safeTodayMinor, cur),
				dailyAllowance: major(s.safe.dailyAllowanceMinor, cur),
				[n("daysLeftInMonth", "daysLeftInCycle")]: s.daysLeft,
				[n("spentThisMonth", "spentThisCycle")]: major(s.monthSpentMinor, cur),
				[n("leftThisMonth", "leftThisCycle")]: major(s.safe.leftThisMonthMinor, cur),
				categoryLimits: limits.map((l) => ({
					category: byId.get(l.categoryId)?.name ?? "Other",
					[n("limit", "limitPerCycle")]: major(l.monthlyLimitMinor, cur),
					spent: major(spent.get(l.categoryId) ?? 0, cur),
				})),
			});
```

Update the tool description: "The person's plan and current period (calendar month, or their cycle with its dates): …". Keep every key unchanged for calendar users (existing tests stay green). In `goals_overview`, name the field `neededPerCycle` for cycle users the same way (needs `const s = await deps.summary.forUser(ctx.userId)` or the period from `periodBounds`).

- [ ] **Step 6: Run the tests**

Run: `cd ~/projects/spendid && docker compose exec -T api sh -c 'cd apps/api && pnpm vitest run src/modules/ask'`
Expected: PASS, including every existing Ask test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ask
git commit -m "feat: Ask understands this cycle and last cycle

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 9: Web: period words and the "Your plan" sheet

**Files:**
- Create: `apps/web/src/lib/plan-setup-api.ts`
- Create: `apps/web/src/lib/period-words.ts`, `apps/web/src/lib/period-words.test.ts`
- Create: `apps/web/src/features/plan/PlanSheet.tsx`
- Create: `apps/web/src/i18n/ms/g.ts`; modify `apps/web/src/i18n/ms.ts`
- Modify: `apps/web/src/features/plan/PlanHero.tsx`, `apps/web/src/features/plan/PlanPage.tsx`

**Interfaces:**
- Consumes: Task 5 routes; Task 1 types `PlanSetup`, `PlanSetupInput`, `PlanPreview`, `Period`; `MethodStep` from `features/onboarding/Steps.tsx`; `Sheet`, `Field`, `toast`, `api`, `ApiError`.
- Produces:
  - `planSetupQuery` (`["plan-setup"]`), `planSetupApi.save(input)`, `planSetupApi.preview(input)`, `planSetupApi.confirm()`, `refreshPlan(queryClient)` (invalidates `summary`, `plan-setup`, `goals`, `budgets`, `transfers`)
  - `cycleDates(start: string, end: string): string` ("29 Oct → 28 Nov", or with years when they differ from this year)
  - `periodWords(kind: PeriodKind)` → `{ income, left, over, limit, each, goalShare }`
  - `<PlanSheet open onClose />`
  - `usePlanSheet()` → `{ open: () => void, sheet: ReactNode }` for every "Change" / "Pick a plan" link

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/period-words.test.ts
import { describe, expect, it } from "vitest";
import { cycleDates, periodWords } from "./period-words";

describe("period words", () => {
	it("writes a cycle's dates the short way", () => {
		expect(cycleDates("2026-10-29", "2026-11-28", "2026-10-31")).toBe("29 Oct → 28 Nov");
		expect(cycleDates("2026-12-20", "2027-01-19", "2026-12-25")).toBe("20 Dec 2026 → 19 Jan 2027");
	});
	it("says cycle or month", () => {
		expect(periodWords("cycle").left).toBe("Left this cycle");
		expect(periodWords("month").left).toBe("Left this month");
		expect(periodWords("cycle").income).toBe("Salary this cycle");
	});
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd ~/projects/spendid && docker compose exec -T web sh -c 'cd apps/web && pnpm vitest run src/lib/period-words.test.ts'` (if the web container has no vitest, run `cd apps/web && pnpm vitest run src/lib/period-words.test.ts` on the host, the way `transfer-drafts.test.ts` is run in `docs/testing.md`)
Expected: FAIL, module not found.

- [ ] **Step 3: Period words and API client**

```ts
// apps/web/src/lib/period-words.ts
import type { PeriodKind } from "@spendid/shared";
import { t } from "@/i18n";
import { dateLocale } from "@/lib/time";

/** "29 Oct → 28 Nov"; years appear when either end isn't in `today`'s year. */
export function cycleDates(start: string, end: string, today: string): string {
	const sameYear = start.slice(0, 4) === today.slice(0, 4) && end.slice(0, 4) === today.slice(0, 4);
	const fmt = (d: string) =>
		new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale(), {
			day: "numeric",
			month: "short",
			...(sameYear ? {} : { year: "numeric" }),
			timeZone: "UTC",
		});
	return `${fmt(start)} → ${fmt(end)}`;
}

/** The words that change when the plan runs by cycle. */
export function periodWords(kind: PeriodKind) {
	return kind === "cycle"
		? {
				income: t("Salary this cycle"),
				left: t("Left this cycle"),
				over: t("Over this cycle"),
				limit: t("Limit per cycle"),
				each: t("each cycle"),
				goalShare: (amount: string, date: string) => t("{amount} a cycle to make it by {date}.", { amount, date }),
			}
		: {
				income: t("Monthly income"),
				left: t("Left this month"),
				over: t("Over this month"),
				limit: t("Monthly limit"),
				each: t("each month"),
				goalShare: (amount: string, date: string) => t("{amount} a month to make it by {date}.", { amount, date }),
			};
}
```

(If `dateLocale` lives elsewhere, import it from where `MonthPace.tsx` imports it. If `en-MY` formatting gives "29 Oct" the test passes as written; if the test runner's default locale differs, have `dateLocale()` return `"en-GB"` for English, which is what the app already uses for short dates; check `MonthPace.tsx`.)

```ts
// apps/web/src/lib/plan-setup-api.ts
import type { PlanPreview, PlanSetup, PlanSetupInput } from "@spendid/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/http";

export const planSetupQuery = queryOptions({
	queryKey: ["plan-setup"],
	queryFn: () => api<PlanSetup>("/api/plan/setup"),
	staleTime: 15_000,
});

const send = <T>(path: string, method: "PUT" | "POST", body?: unknown) =>
	api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const planSetupApi = {
	save: (input: PlanSetupInput) => send<PlanSetup>("/api/plan/setup", "PUT", input),
	preview: (input: PlanSetupInput) => send<PlanPreview>("/api/plan/setup/preview", "POST", input),
	confirm: () => send<PlanSetup>("/api/plan/cycle/confirm", "POST"),
};

/** Everything a plan change touches. */
export async function refreshPlan(queryClient: QueryClient): Promise<void> {
	await Promise.all(
		["summary", "plan-setup", "goals", "budgets", "transfers", "me"].map((key) =>
			queryClient.invalidateQueries({ queryKey: [key] }),
		),
	);
}
```

(Check `apps/web/src/lib/http.ts` sets `content-type: application/json` when a body is given; `AnnounceTab.tsx` calls `api` the same way.)

- [ ] **Step 4: The sheet**

```tsx
// apps/web/src/features/plan/PlanSheet.tsx
import {
	type BudgetMethod,
	daysInclusive,
	formatMinor,
	type PeriodKind,
	type PlanSetupInput,
	parseAmount,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Field } from "@/components/form/Field";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { summaryQuery } from "@/lib/money-api";
import { planSetupApi, planSetupQuery, refreshPlan } from "@/lib/plan-setup-api";
import { MethodStep } from "../onboarding/Steps";

interface Draft {
	period: PeriodKind;
	startsOn: string;
	endsOn: string;
	income: string;
	method: BudgetMethod | null;
}

/** What the sheet would save, or the first problem to show (checked again on the server). */
function toInput(d: Draft, currency: string): { input: PlanSetupInput } | { field: string; message: string } {
	const major = parseAmount(d.income);
	if (d.income.trim() === "" || Number.isNaN(major))
		return { field: "incomeMinor", message: t("Add your salary.") };
	if (d.period === "cycle" && (!d.startsOn || !d.endsOn))
		return { field: "cycle.startsOn", message: t("Pick the start and end dates.") };
	return {
		input: {
			period: d.period,
			cycle: d.period === "cycle" ? { startsOn: d.startsOn, endsOn: d.endsOn } : null,
			incomeMinor: toMinor(major, currency),
			method: d.method,
		},
	};
}

export function PlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const queryClient = useQueryClient();
	const { data: setup } = useQuery({ ...planSetupQuery, enabled: open });
	const { data: summary } = useQuery(summaryQuery);
	const currency = summary?.homeCurrency ?? "MYR";
	const [draft, setDraft] = useState<Draft | null>(null);
	const [fields, setFields] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [daily, setDaily] = useState<number | null>(null);
	const periodId = useId();

	// Fill from the saved plan each time the sheet opens.
	useEffect(() => {
		if (!open || !setup) return;
		setDraft({
			period: setup.period,
			startsOn: setup.cycle?.startsOn ?? "",
			endsOn: setup.cycle?.endsOn ?? "",
			income: setup.incomeMinor === null ? "" : String(setup.incomeMinor / 100),
			method: setup.method,
		});
		setFields({});
		setError(null);
	}, [open, setup]);

	// Live daily amount, worked out by the server (the same maths as Home).
	useEffect(() => {
		if (!draft) return;
		const built = toInput(draft, currency);
		if (!("input" in built)) return setDaily(null);
		const timer = setTimeout(() => {
			planSetupApi
				.preview(built.input)
				.then((p) => setDaily(p.status === "no-income" ? null : p.dailyAllowanceMinor))
				.catch(() => setDaily(null));
		}, 300);
		return () => clearTimeout(timer);
	}, [draft, currency]);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!draft) return;
		const built = toInput(draft, currency);
		if (!("input" in built)) return setFields({ [built.field]: built.message });
		setPending(true);
		setError(null);
		setFields({});
		try {
			await planSetupApi.save(built.input);
			await refreshPlan(queryClient);
			toast(t("Plan saved."));
			onClose();
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length)
				setFields(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, t(v)])));
			else setError(err instanceof ApiError ? err.message : t("Couldn't save. Try again."));
		}
		setPending(false);
	}

	const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
	const length =
		draft?.startsOn && draft.endsOn && draft.endsOn >= draft.startsOn
			? daysInclusive(draft.startsOn, draft.endsOn)
			: null;

	return (
		<Sheet open={open} onClose={onClose} title={t("Your plan")}>
			{!draft ? (
				<p className="text-ink-soft">{t("Loading…")}</p>
			) : (
				<form onSubmit={onSubmit} noValidate className="space-y-5">
					<fieldset className="space-y-2">
						<legend id={periodId} className="font-semibold">{t("Budget period")}</legend>
						<div role="radiogroup" aria-labelledby={periodId} className="grid grid-cols-2 gap-2">
							{(["month", "cycle"] as const).map((kind) => (
								<button
									key={kind}
									type="button"
									role="radio"
									aria-checked={draft.period === kind}
									onClick={() => set({ period: kind })}
									className={cn(
										"min-h-11 rounded-full border-2 px-3 py-2 leading-snug font-semibold",
										draft.period === kind ? "border-plum-500 bg-plum-500/10" : "border-line",
									)}
								>
									{kind === "month" ? t("Calendar month") : t("My own dates")}
								</button>
							))}
						</div>
					</fieldset>

					{draft.period === "cycle" && (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<Field label={t("Starts")} type="date" value={draft.startsOn} max={setup?.today}
								onChange={(e) => set({ startsOn: e.target.value })} error={fields["cycle.startsOn"]} />
							<Field label={t("Ends")} type="date" value={draft.endsOn} min={setup?.today}
								onChange={(e) => set({ endsOn: e.target.value })} error={fields["cycle.endsOn"]}
								hint={length ? t("{n} days", { n: length }) : undefined} />
						</div>
					)}

					<Field
						label={draft.period === "cycle" ? t("Salary this cycle") : t("Monthly income")}
						inputMode="decimal"
						value={draft.income}
						onChange={(e) => set({ income: e.target.value })}
						error={fields.incomeMinor}
					/>

					<div className="space-y-2">
						<p className="font-semibold">{t("Plan style")}</p>
						<MethodStep value={draft.method} onChange={(method) => set({ method })} />
					</div>

					<p aria-live="polite" className="rounded-tile bg-surface-2 px-4 py-3 text-[0.95rem]">
						{daily === null
							? t("Your daily amount shows here.")
							: t("About {amount} a day to spend.", { amount: formatMinor(daily, currency) })}
					</p>

					<MaybeAlert tone="error" message={error} />
					<SubmitButton pending={pending} pendingLabel={t("Saving…")}>{t("Save")}</SubmitButton>
				</form>
			)}
		</Sheet>
	);
}

/** One sheet for every "Change" and "Pick a plan" link. */
export function usePlanSheet() {
	const [open, setOpen] = useState(false);
	return {
		open: () => setOpen(true),
		sheet: <PlanSheet open={open} onClose={() => setOpen(false)} />,
	};
}
```

Notes for the implementer:
- Keep the income box consistent with the rest of the app: if other boxes show "4500" for 450000 minor, use `String(minor / 10 ** minorDigits(currency))` as `OnboardingPage.initialIncome` does (import `minorDigits`).
- `MethodStep` renders the four style cards with their own labels; confirm it has no "Skip" button inside (onboarding's skip lives in `OnboardingPage`). If the person has no plan yet, the cards simply have none selected.
- After a successful save where `method === "pay_yourself_first"` and `summary.transfers.length === 0`, navigate to `/app/plan#transfers` (the transfers section already has `id="transfers"`; add it if missing) so the editor is in view.

- [ ] **Step 5: Use the sheet everywhere Plan sent people to setup**

In `PlanHero.tsx`, replace the `<Link to="/onboarding" ...>` "Change" with a `<button type="button" onClick={plan.open} className={/* same classes */}>` and render `{plan.sheet}` once at the end of the component (`const plan = usePlanSheet();`). Same in `PlanPage.tsx` for "Pick a plan" and "Add income" (one `usePlanSheet()` in `PlanPage`, its `sheet` rendered once). Leave onboarding and its `edit` route untouched.

- [ ] **Step 6: Malay strings**

```ts
// apps/web/src/i18n/ms/g.ts
/** Pay cycle and the "Your plan" sheet. */
export const msG: Record<string, string> = {
	"Your plan": "Pelan anda",
	"Budget period": "Tempoh bajet",
	"Calendar month": "Bulan kalendar",
	"My own dates": "Tarikh saya sendiri",
	Starts: "Mula",
	Ends: "Tamat",
	"{n} days": "{n} hari",
	"Salary this cycle": "Gaji kitaran ini",
	"Plan style": "Gaya pelan",
	"Your daily amount shows here.": "Jumlah harian anda dipaparkan di sini.",
	"About {amount} a day to spend.": "Kira-kira {amount} sehari untuk dibelanjakan.",
	"Plan saved.": "Pelan disimpan.",
	"Couldn't save. Try again.": "Tidak dapat menyimpan. Cuba lagi.",
	"Saving…": "Menyimpan…",
	"Add your salary.": "Masukkan gaji anda.",
	"Pick the start and end dates.": "Pilih tarikh mula dan tamat.",
	"The end has to be after the start.": "Tarikh tamat mesti selepas tarikh mula.",
	"A cycle is 7 to 62 days.": "Satu kitaran ialah 7 hingga 62 hari.",
	"Today has to be inside your cycle.": "Hari ini mesti berada dalam kitaran anda.",
	"This starts before your last cycle began.": "Ini bermula sebelum kitaran lepas anda bermula.",
	"That would make your last cycle shorter than 7 days.": "Ini menjadikan kitaran lepas anda kurang daripada 7 hari.",
	"That would make your last cycle longer than 62 days.": "Ini menjadikan kitaran lepas anda lebih daripada 62 hari.",
	"Left this cycle": "Baki kitaran ini",
	"Over this cycle": "Terlebih kitaran ini",
	"Limit per cycle": "Had setiap kitaran",
	"each cycle": "setiap kitaran",
	"{amount} a cycle to make it by {date}.": "{amount} setiap kitaran untuk capai sebelum {date}.",
};
```

Add `import { msG } from "./ms/g";` and `...msG,` to `apps/web/src/i18n/ms.ts`. Keys that already exist in `a.ts`–`f.ts` ("Monthly income", "Save", "Loading…", "Left this month", …) are not repeated.

- [ ] **Step 7: Run checks**

Run: `cd ~/projects/spendid && make typecheck && (cd apps/web && pnpm vitest run src/lib/period-words.test.ts)`
Expected: typecheck clean, test PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat: change the plan from one sheet

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 10: Web: Home and Plan follow the period, and the draft card

**Files:**
- Create: `apps/web/src/features/home/DraftCycleCard.tsx`
- Modify: `apps/web/src/features/home/HomePage.tsx`, `SafeCard.tsx`, `StatTiles.tsx`, `MonthPace.tsx`
- Modify: `apps/web/src/features/plan/PlanHero.tsx`, `GoalsSection.tsx`, `StyleBudgets.tsx`, `Transfers.tsx`
- Modify: the family screen that renders `SharedView.month` (`grep -rln "lastMonthMinor" apps/web/src`)
- Modify: `apps/web/src/i18n/ms/g.ts`

**Interfaces:**
- Consumes: Task 4 `Summary.period`, `Summary.dailyMinor`; Task 9 `periodWords`, `cycleDates`, `planSetupApi.confirm`, `refreshPlan`, `usePlanSheet`.
- Produces: `<DraftCycleCard summary={summary} />` (renders nothing unless `summary.period.status === "draft"`).

- [ ] **Step 1: Draft card**

```tsx
// apps/web/src/features/home/DraftCycleCard.tsx
import { addDays, formatMinor, type Summary } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "@/components/ui/Toast";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { cycleDates } from "@/lib/period-words";
import { planSetupApi, refreshPlan } from "@/lib/plan-setup-api";
import { usePlanSheet } from "../plan/PlanSheet";

/** After a cycle ends: the drafted next one, to confirm or change. */
export function DraftCycleCard({ summary }: { summary: Summary }) {
	const queryClient = useQueryClient();
	const plan = usePlanSheet();
	const [pending, setPending] = useState(false);
	const { period } = summary;
	if (period.status !== "draft") return null;
	const today = new Date().toISOString().slice(0, 10);
	const ended = addDays(period.start, -1);

	async function looksRight() {
		setPending(true);
		try {
			await planSetupApi.confirm();
			await refreshPlan(queryClient);
			toast(t("Your new cycle is set."));
		} catch {
			toast(t("Couldn't save. Try again."));
			setPending(false);
		}
	}

	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			aria-labelledby="draft-cycle-title"
			className="rounded-panel border-2 border-marigold/60 bg-surface p-5"
		>
			<h2 id="draft-cycle-title" className="text-[1.15rem] font-bold">
				{t("Your cycle ended on {date}.", {
					date: new Date(`${ended}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }),
				})}
			</h2>
			<p className="mt-1 text-ink-soft">
				{t("Next: {dates}, salary {amount}.", {
					dates: cycleDates(period.start, period.end, today),
					amount: formatMinor(summary.incomeMinor ?? 0, summary.homeCurrency),
				})}
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<button type="button" disabled={pending} onClick={() => void looksRight()} className={buttonClass("coin", "md")}>
					{t("Looks right")}
				</button>
				<button type="button" onClick={plan.open} className={buttonClass("ghost", "md")}>
					{t("Change")}
				</button>
			</div>
			{plan.sheet}
		</motion.section>
	);
}
```

(Use the date-format helper and button variants the app already has: copy the locale choice from `cycleDates`, and the variant names from `Button.tsx`.)

In `HomePage.tsx` render `{summary && <DraftCycleCard summary={summary} />}` directly above `<SafeCard …>`.

- [ ] **Step 2: Wording on Home and Plan**

- `StatTiles.tsx:67`: `const w = periodWords(summary.period.kind);` → `label: left < 0 ? w.over : w.left`.
- `SafeCard.tsx:52`: for cycles, `t("Keep today to the essentials. Your next cycle starts {date}.", { date })` with `date` = the day after `summary.period.end`; month users keep the existing line. `SafeCard.tsx:85`: "This cycle is over budget by" for cycles.
- `PlanHero.tsx:200`: `periodWords(summary.period.kind).income`, and under it, for cycles, a line with `cycleDates(summary.period.start, summary.period.end, today)`.
- `GoalsSection.tsx:61`: use `periodWords(kind).goalShare(...)`; `GoalsSection.tsx:219` hint: "With a date, Spendid sets aside enough each cycle." for cycles.
- `StyleBudgets.tsx:161-164`: `w.limit` for the placeholder, and the aria-label "{limit} for {category}".
- `Transfers.tsx:199,224`: "What goes out each cycle when salary lands" / "Transfers each cycle" for cycles.
- Family screen: label the shared total "This cycle ({dates})" when `month.kind === "cycle"`, "Last cycle" for the comparison.

Add every new string to `ms/g.ts`:

```ts
	"Your cycle ended on {date}.": "Kitaran anda tamat pada {date}.",
	"Next: {dates}, salary {amount}.": "Seterusnya: {dates}, gaji {amount}.",
	"Looks right": "Betul",
	"Your new cycle is set.": "Kitaran baharu anda sudah ditetapkan.",
	"Keep today to the essentials. Your next cycle starts {date}.": "Hari ini belanja yang perlu sahaja. Kitaran seterusnya bermula {date}.",
	"This cycle is over budget by": "Kitaran ini melebihi bajet sebanyak",
	"With a date, Spendid sets aside enough each cycle.": "Dengan tarikh, Spendid mengasingkan secukupnya setiap kitaran.",
	"What goes out each cycle when salary lands": "Apa yang keluar setiap kitaran bila gaji masuk",
	"Transfers each cycle": "Pindahan setiap kitaran",
	"Where your cycle is heading": "Ke mana kitaran anda menuju",
	"At this pace, you'll finish the cycle with {amount} to spare.": "Pada kadar ini, anda akan tamatkan kitaran dengan baki {amount}.",
	"This cycle ({dates})": "Kitaran ini ({dates})",
	"Last cycle": "Kitaran lepas",
```

- [ ] **Step 3: Pace from the summary**

In `MonthPace.tsx`, stop using the heatmap for the daily numbers: use `summary.dailyMinor` for `dailyMinor`, `summary.period.days` for `daysInMonth`, and turn `pace.runsOutOn` (a day index, 1-based) into a date with `addDays(summary.period.start, pace.runsOutOn - 1)`. For cycles the title is "Where your cycle is heading" and the landing line is "At this pace, you'll finish the cycle with {amount} to spare."; month users keep today's copy (`monthName` stays). Remove the `heatmapQuery` import if nothing else in the file uses it. Update the doc comments in `packages/shared/src/pace.ts` to say "period" (no logic change).

- [ ] **Step 4: Run checks**

Run: `cd ~/projects/spendid && make typecheck && make test`
Expected: clean, all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src packages/shared/src/pace.ts
git commit -m "feat: Home and Plan speak in cycles, with a card for the next cycle

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 11: End-to-end tests

**Files:**
- Create: `e2e/tests/cycle.spec.ts`
- Modify: `e2e/tests/plan.spec.ts` (tests that click "Change"/"Pick a plan" now meet the sheet; `toPlanStep` via `/onboarding?edit=true` keeps working)

- [ ] **Step 1: Write the tests**

```ts
// e2e/tests/cycle.spec.ts
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { stateFile } from "./support/accounts";
import { expectNoSeriousIssues } from "./support/axe";

/** Pay cycles and the one-sheet plan change. Every test puts Maya's plan back as it was. */
test.use({ storageState: stateFile("maya") });

interface Setup {
	period: "month" | "cycle";
	cycle: { startsOn: string; endsOn: string } | null;
	incomeMinor: number | null;
	method: string | null;
	today: string;
}
const data = async <T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> => {
	expect(res.ok(), `${res.url()} → ${res.status()}`).toBe(true);
	return ((await res.json()) as { data: T }).data;
};
const getSetup = (r: APIRequestContext) => r.get("/api/plan/setup").then((x) => data<Setup>(x));
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let saved: Setup;
test.beforeEach(async ({ request }) => {
	saved = await getSetup(request);
});
test.afterEach(async ({ request }) => {
	await data(await request.put("/api/plan/setup", {
		data: { period: "month", cycle: null, incomeMinor: saved.incomeMinor ?? 0, method: saved.method },
	}));
});

async function openSheet(page: Page) {
	await page.goto("/app/plan");
	await page.getByRole("button", { name: /Change/ }).click();
	await expect(page.getByRole("dialog", { name: "Your plan" })).toBeVisible();
}

test("switch to my own dates: Home and Plan show the cycle and its salary", async ({ page, request }) => {
	const { today } = saved;
	await openSheet(page);
	await page.getByRole("radio", { name: "My own dates" }).click();
	await page.getByLabel("Starts").fill(addDays(today, -2));
	await page.getByLabel("Ends").fill(addDays(today, 28));
	await expect(page.getByText("31 days")).toBeVisible();
	await page.getByLabel("Salary this cycle").fill("4,500");
	await expect(page.getByText(/About RM\s?[\d,.]+ a day to spend\./)).toBeVisible();
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Plan saved.")).toBeVisible();
	await expect(page.getByText("Salary this cycle")).toBeVisible();
	const s = await getSetup(request);
	expect(s).toMatchObject({ period: "cycle", cycle: { startsOn: addDays(today, -2), endsOn: addDays(today, 28) }, incomeMinor: 450_000 });
	await page.goto("/app");
	await expect(page.getByText(/Left this cycle|Over this cycle/)).toBeVisible();
});

test("empty dates are refused and nothing is saved", async ({ page, request }) => {
	await openSheet(page);
	await page.getByRole("radio", { name: "My own dates" }).click();
	await page.getByLabel("Starts").fill("");
	await page.getByLabel("Ends").fill("");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Pick the start and end dates.")).toBeVisible();
	expect((await getSetup(request)).period).toBe(saved.period);
});

test("a too-short cycle shows the rule next to the field", async ({ page }) => {
	const { today } = saved;
	await openSheet(page);
	await page.getByRole("radio", { name: "My own dates" }).click();
	await page.getByLabel("Starts").fill(today);
	await page.getByLabel("Ends").fill(addDays(today, 3));
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("A cycle is 7 to 62 days.")).toBeVisible();
});

test("back to the calendar month", async ({ page, request }) => {
	const { today } = saved;
	await data(await request.put("/api/plan/setup", { data: { period: "cycle", cycle: { startsOn: addDays(today, -2), endsOn: addDays(today, 28) }, incomeMinor: 450_000, method: saved.method } }));
	await openSheet(page);
	await page.getByRole("radio", { name: "Calendar month" }).click();
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Plan saved.")).toBeVisible();
	expect((await getSetup(request)).period).toBe("month");
	await expect(page.getByText("Monthly income")).toBeVisible();
});

test("draft cycle card: Looks right and Change", async ({ page }) => {
	// A drafted cycle can't be made without moving the server's clock, so the summary is mocked here;
	// drafting itself is covered by the API tests.
	const { today } = saved;
	await page.route("**/api/summary", async (route) => {
		const res = await route.fetch();
		const body = await res.json();
		body.data.period = { kind: "cycle", start: today, end: addDays(today, 30), days: 31, cycleId: "0192f000-0000-7000-8000-000000000000", status: "draft" };
		await route.fulfill({ response: res, json: body });
	});
	let confirmed = false;
	await page.route("**/api/plan/cycle/confirm", async (route) => {
		confirmed = true;
		await route.fulfill({ json: { success: true, data: saved } });
	});
	await page.goto("/app");
	await expect(page.getByText(/Your cycle ended on/)).toBeVisible();
	await page.getByRole("button", { name: "Change" }).first().click();
	await expect(page.getByRole("dialog", { name: "Your plan" })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Looks right" }).click();
	await expect(page.getByText("Your new cycle is set.")).toBeVisible();
	expect(confirmed).toBe(true);
});

test("the sheet fits a small phone", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 });
	await openSheet(page);
	await page.getByRole("radio", { name: "My own dates" }).click();
	const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
	expect(wide).toBe(false);
	await expectNoSeriousIssues(page);
});

test("in Bahasa Melayu the sheet is translated", async ({ page, request }) => {
	await data(await request.put("/api/me/locale", { data: { locale: "ms" } }));
	try {
		await page.goto("/app/plan");
		await page.getByRole("button", { name: /Tukar|Change/ }).click();
		await expect(page.getByRole("dialog", { name: "Pelan anda" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "Tarikh saya sendiri" })).toBeVisible();
	} finally {
		await data(await request.put("/api/me/locale", { data: { locale: "en" } }));
	}
});
```

In `plan.spec.ts`, any test that clicks the Plan page's "Pick a plan" or "Change" link and expects the onboarding heading must now expect `getByRole("dialog", { name: "Your plan" })` and choose the style there (`planCard(page, title)` still finds the style cards, since the sheet reuses `MethodStep`). Restore with `PUT /api/plan/setup` where they used `PUT /api/me/profile` only if the period changed.

- [ ] **Step 2: Run them (local stack up, one run at a time)**

Run: `cd ~/projects/spendid/e2e && pnpm exec playwright test tests/cycle.spec.ts tests/plan.spec.ts`
Expected: all PASS on phone and desktop projects.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests
git commit -m "test: cycle and plan sheet end to end

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

---

### Task 12: Live Ask check, docs, and the full run

**Files:**
- Modify: scratchpad `ask-accuracy-eval.mjs` (cycle cases), `README.md`, `docs/privacy-and-data.md`
- Modify: the spec's Status line

- [ ] **Step 1: Live eval cases**

Add to the scratchpad live eval (it signs in as a local member and asks the real model): set maya to a cycle via `PUT /api/plan/setup` (start = today − 5, end = today + 25), seed 3 expenses inside the cycle and 1 the day before it, then ask and check exact amounts: "how much did I spend this cycle?", "how much did I spend this month?" (calendar), "what's left this cycle?", "berapa saya belanja kitaran ini?", "how much did I spend last cycle?" (no earlier cycle → answer says calendar month and gives last month's figure). Restore maya to the calendar month afterwards. Run it once; every case must pass.

- [ ] **Step 2: Docs**

- `README.md`: in the Plan section, one short paragraph: "Your plan" sheet; calendar month or your own cycle dates (7–62 days, salary per cycle); Spendid drafts the next cycle and asks you to confirm.
- `docs/privacy-and-data.md`: add "budget cycles (dates, salary)" to what the download contains.
- Spec status line: "Status: built (see plan)".

- [ ] **Step 3: The full run (nothing ships until all of it passes)**

Run, one at a time:

```bash
cd ~/projects/spendid && make typecheck && make check && make test
cd ~/projects/spendid/e2e && pnpm exec playwright test
```

Expected: all green. If an E2E test flakes because of the local Docker VM, re-run that file alone before treating it as a failure; never mark a red test as done.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: pay cycles and the plan sheet

Claude-Session: https://claude.ai/code/session_01UJ5aDZHeoVVtPL6MsYHC25"
```

Then report to the user. Do not push or deploy until they ask.
