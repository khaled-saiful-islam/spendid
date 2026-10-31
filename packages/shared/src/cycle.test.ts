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
	const check = (
		r: { startsOn: string; endsOn: string },
		previous: { startsOn: string; endsOn: string } | null = null,
		joinPrevious = false,
	) => checkCycle({ range: r, today, previous, joinPrevious });

	it("accepts a first cycle around today", () => {
		expect(check(range)).toEqual({ ok: true, previousEndsOn: null });
	});

	it("refuses an end before the start", () => {
		expect(
			check({ startsOn: "2026-10-29", endsOn: "2026-10-20" }),
		).toMatchObject({
			ok: false,
			field: "endsOn",
			message: "The end has to be after the start.",
		});
	});

	it("refuses fewer than 7 or more than 62 days", () => {
		const rule = { ok: false, message: "A cycle is 7 to 62 days." };
		expect(
			check({ startsOn: "2026-10-29", endsOn: "2026-11-03" }),
		).toMatchObject(rule);
		expect(
			check({ startsOn: "2026-10-01", endsOn: "2026-12-02" }),
		).toMatchObject(rule);
		expect(check({ startsOn: "2026-10-29", endsOn: "2026-11-04" }).ok).toBe(
			true,
		);
		expect(check({ startsOn: "2026-10-01", endsOn: "2026-12-01" }).ok).toBe(
			true,
		);
	});

	it("refuses a cycle that doesn't include today", () => {
		const rule = {
			ok: false,
			field: "startsOn",
			message: "Today has to be inside your cycle.",
		};
		expect(
			check({ startsOn: "2026-11-01", endsOn: "2026-11-30" }),
		).toMatchObject(rule);
		expect(
			check({ startsOn: "2026-10-01", endsOn: "2026-10-30" }),
		).toMatchObject(rule);
	});

	it("moves the previous cycle's end to the day before the new start", () => {
		const previous = { startsOn: "2026-09-29", endsOn: "2026-10-28" };
		expect(
			check({ startsOn: "2026-10-27", endsOn: "2026-11-26" }, previous, true),
		).toEqual({ ok: true, previousEndsOn: "2026-10-26" });
		expect(
			check({ startsOn: "2026-10-31", endsOn: "2026-11-29" }, previous, true),
		).toEqual({ ok: true, previousEndsOn: "2026-10-30" });
	});

	it("refuses a start on or before the previous cycle's start", () => {
		const previous = { startsOn: "2026-10-20", endsOn: "2026-10-28" };
		expect(
			check({ startsOn: "2026-10-20", endsOn: "2026-11-15" }, previous, true),
		).toMatchObject({
			ok: false,
			field: "startsOn",
			message: "This starts before your last cycle began.",
		});
	});

	it("refuses leaving the previous cycle under 7 or over 62 days", () => {
		const short = { startsOn: "2026-10-25", endsOn: "2026-10-28" };
		expect(check(range, short, true)).toMatchObject({
			ok: false,
			message: "That would make your last cycle shorter than 7 days.",
		});
		const old = { startsOn: "2026-08-20", endsOn: "2026-09-19" };
		expect(check(range, old, true)).toMatchObject({
			ok: false,
			message: "That would make your last cycle longer than 62 days.",
		});
	});

	it("allows a gap after calendar months (a new run), but never an overlap", () => {
		const old = { startsOn: "2026-08-20", endsOn: "2026-09-19" };
		expect(check(range, old, false)).toEqual({
			ok: true,
			previousEndsOn: null,
		});
		const touching = { startsOn: "2026-10-01", endsOn: "2026-10-30" };
		expect(check(range, touching, false)).toEqual({
			ok: true,
			previousEndsOn: "2026-10-28",
		});
	});
});

describe("drafts", () => {
	it("starts the next cycle the day after, with the same length", () => {
		expect(nextCycle({ startsOn: "2026-10-29", endsOn: "2026-11-28" })).toEqual(
			{
				startsOn: "2026-11-29",
				endsOn: "2026-12-29",
			},
		);
		expect(nextCycle({ startsOn: "2028-02-01", endsOn: "2028-02-14" })).toEqual(
			{
				startsOn: "2028-02-15",
				endsOn: "2028-02-28",
			},
		);
	});

	it("drafts nothing while the last cycle covers today", () => {
		expect(
			draftsUntil(
				{ startsOn: "2026-10-29", endsOn: "2026-11-28" },
				"2026-11-28",
			),
		).toEqual([]);
	});

	it("drafts back to back until one covers today", () => {
		expect(
			draftsUntil(
				{ startsOn: "2026-08-01", endsOn: "2026-08-30" },
				"2026-10-31",
			),
		).toEqual([
			{ startsOn: "2026-08-31", endsOn: "2026-09-29" },
			{ startsOn: "2026-09-30", endsOn: "2026-10-29" },
			{ startsOn: "2026-10-30", endsOn: "2026-11-28" },
		]);
	});
});

describe("goalCycleNeeded", () => {
	const goal = {
		targetMinor: 120_000,
		savedMinor: 20_000,
		targetDate: "2027-01-27",
	};

	it("splits what's left over the cycles until the date, rounded up", () => {
		// 29 Oct → 27 Jan is 91 days; 31-day cycles → 3 cycles; 100,000 / 3 → 33,334.
		expect(goalCycleNeeded(goal, "2026-10-29", 31)).toBe(33_334);
	});

	it("needs nothing for open-ended or finished goals", () => {
		expect(
			goalCycleNeeded({ ...goal, targetDate: null }, "2026-10-29", 31),
		).toBe(0);
		expect(
			goalCycleNeeded({ ...goal, savedMinor: 120_000 }, "2026-10-29", 31),
		).toBe(0);
	});

	it("asks for everything this cycle when the date has passed", () => {
		expect(
			goalCycleNeeded({ ...goal, targetDate: "2026-10-01" }, "2026-10-29", 31),
		).toBe(100_000);
	});
});

describe("PlanSetupInputSchema", () => {
	it("needs dates for a cycle", () => {
		const r = PlanSetupInputSchema.safeParse({
			period: "cycle",
			cycle: null,
			incomeMinor: 450_000,
			method: null,
		});
		expect(r.success).toBe(false);
		expect(r.error?.issues[0]).toMatchObject({
			path: ["cycle", "startsOn"],
			message: "Pick the start and end dates.",
		});
	});

	it("accepts the calendar month without dates", () => {
		expect(
			PlanSetupInputSchema.parse({
				period: "month",
				cycle: null,
				incomeMinor: 450_000,
				method: "envelope",
			}).period,
		).toBe("month");
	});
});
