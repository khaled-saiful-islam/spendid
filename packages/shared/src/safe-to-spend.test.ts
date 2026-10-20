import { describe, expect, it } from "vitest";
import {
	computeSafeToSpend,
	goalMonthlyNeeded,
	reservedSavings,
} from "./safe-to-spend";

describe("computeSafeToSpend", () => {
	const base = {
		incomeMinor: 600_000,
		reservedMinor: 120_000,
		spentBeforeTodayMinor: 0,
		spentTodayMinor: 0,
		daysLeft: 30,
	};

	it("splits what's left evenly across the remaining days", () => {
		const r = computeSafeToSpend(base);
		expect(r.dailyAllowanceMinor).toBe(16_000);
		expect(r.safeTodayMinor).toBe(16_000);
		expect(r.status).toBe("ok");
	});

	it("keeps money back for bills still due this month", () => {
		const r = computeSafeToSpend({ ...base, billsDueMinor: 30_000 });
		expect(r.dailyAllowanceMinor).toBe(15_000);
		expect(r.leftThisMonthMinor).toBe(450_000);
	});

	it("subtracts what was already spent today", () => {
		const r = computeSafeToSpend({ ...base, spentTodayMinor: 4_500 });
		expect(r.safeTodayMinor).toBe(11_500);
		expect(r.leftThisMonthMinor).toBe(475_500);
	});

	it("shrinks tomorrow's allowance after a big day, never today's retroactively", () => {
		const r = computeSafeToSpend({
			...base,
			spentBeforeTodayMinor: 300_000,
			daysLeft: 10,
		});
		expect(r.dailyAllowanceMinor).toBe(18_000);
	});

	it("reports 'over' when today's spending passes the allowance", () => {
		const r = computeSafeToSpend({ ...base, spentTodayMinor: 20_000 });
		expect(r.status).toBe("over");
		expect(r.safeTodayMinor).toBe(-4_000);
	});

	it("says 'over' when the month is already overspent, with no negative allowance", () => {
		const r = computeSafeToSpend({ ...base, spentBeforeTodayMinor: 700_000 });
		expect(r.dailyAllowanceMinor).toBe(0);
		expect(r.status).toBe("over");
		expect(r.leftThisMonthMinor).toBeLessThan(0);
	});

	it("stays 'ok' at exactly nothing left", () => {
		const r = computeSafeToSpend({
			...base,
			incomeMinor: 0,
			reservedMinor: 0,
			spentBeforeTodayMinor: 0,
		});
		expect(r.status).toBe("ok");
	});

	it("asks for income when there is none", () => {
		expect(computeSafeToSpend({ ...base, incomeMinor: null }).status).toBe(
			"no-income",
		);
	});
});

describe("reservedSavings", () => {
	it("keeps 20% aside for 50/30/20 unless goals need more", () => {
		expect(
			reservedSavings({
				incomeMinor: 500_000,
				method: "fifty_thirty_twenty",
				goalsMonthlyMinor: 50_000,
			}),
		).toBe(100_000);
		expect(
			reservedSavings({
				incomeMinor: 500_000,
				method: "fifty_thirty_twenty",
				goalsMonthlyMinor: 150_000,
			}),
		).toBe(150_000);
	});

	it("reserves only goal amounts for other styles", () => {
		expect(
			reservedSavings({
				incomeMinor: 500_000,
				method: "envelope",
				goalsMonthlyMinor: 30_000,
			}),
		).toBe(30_000);
	});

	it("keeps exactly the transfers aside for pay yourself first, goals or not", () => {
		const base = {
			incomeMinor: 400_000,
			method: "pay_yourself_first" as const,
			goalsMonthlyMinor: 30_000,
		};
		expect(reservedSavings({ ...base, transfersMinor: 80_000 })).toBe(80_000);
		expect(reservedSavings(base)).toBe(0);
	});

	it("leaves salary minus transfers to spend", () => {
		const safe = computeSafeToSpend({
			incomeMinor: 400_000,
			reservedMinor: 80_000,
			spentBeforeTodayMinor: 0,
			spentTodayMinor: 0,
			daysLeft: 10,
		});
		expect(safe.leftThisMonthMinor).toBe(320_000);
		expect(safe.dailyAllowanceMinor).toBe(32_000);
	});
});

describe("goalMonthlyNeeded", () => {
	const today = "2026-10-16";

	it("spreads the remaining amount over the months left, rounding up", () => {
		expect(
			goalMonthlyNeeded(
				{ targetMinor: 300_000, savedMinor: 0, targetDate: "2027-01-15" },
				today,
			),
		).toBe(100_000);
	});

	it("is zero for open-ended or finished goals", () => {
		expect(
			goalMonthlyNeeded(
				{ targetMinor: 300_000, savedMinor: 0, targetDate: null },
				today,
			),
		).toBe(0);
		expect(
			goalMonthlyNeeded(
				{ targetMinor: 300_000, savedMinor: 300_000, targetDate: "2027-01-01" },
				today,
			),
		).toBe(0);
	});

	it("asks for everything this month when the date has passed", () => {
		expect(
			goalMonthlyNeeded(
				{ targetMinor: 50_000, savedMinor: 10_000, targetDate: "2026-09-01" },
				today,
			),
		).toBe(40_000);
	});
});
