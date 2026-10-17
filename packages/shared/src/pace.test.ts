import { describe, expect, it } from "vitest";
import { goalWeeksSooner, monthPace, whatIf } from "./pace";

describe("monthPace", () => {
	it("runs totals, an even pace, and lands with money to spare", () => {
		const p = monthPace({
			budgetMinor: 30_000,
			dailyMinor: [500, 500, 500],
			daysInMonth: 30,
			billsDueMinor: 0,
		});
		expect(p.actual).toEqual([500, 1_000, 1_500]);
		expect(p.even[2]).toBe(3_000);
		expect(p.vsEvenMinor).toBe(-1_500);
		expect(p.perDayMinor).toBe(500);
		expect(p.forecast.at(-1)).toBe(15_000);
		expect(p.landingMinor).toBe(15_000);
		expect(p.runsOutOn).toBeNull();
	});

	it("says which day the money runs out, counting bills still due", () => {
		const p = monthPace({
			budgetMinor: 10_000,
			dailyMinor: [1_000, 1_000],
			daysInMonth: 30,
			billsDueMinor: 2_000,
		});
		expect(p.landingMinor).toBe(10_000 - (2_000 + 1_000 * 28 + 2_000));
		// 10,000 − 2,000 spent − 2,000 bills = 6,000 left at 1,000 a day: day 8.
		expect(p.runsOutOn).toBe(8);
	});
});

describe("what if", () => {
	it("adds what a smaller daily spend leaves over", () => {
		expect(whatIf({ landingMinor: -3_000 }, 14, 500)).toEqual({
			landingMinor: 4_000,
			extraMinor: 7_000,
		});
	});
	it("brings a goal forward", () => {
		// 12,000 left at 1,000 a month = 12 months; with 1,000 more = 6 months, 26 weeks sooner.
		expect(
			goalWeeksSooner(
				{ targetMinor: 20_000, savedMinor: 8_000, monthlyNeededMinor: 1_000 },
				1_000,
			),
		).toBe(26);
		expect(
			goalWeeksSooner(
				{ targetMinor: 1_000, savedMinor: 1_000, monthlyNeededMinor: 0 },
				500,
			),
		).toBeNull();
	});
});
