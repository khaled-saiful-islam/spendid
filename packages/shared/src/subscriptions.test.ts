import { describe, expect, it } from "vitest";
import {
	daysUntil,
	dueDatesUntil,
	monthlyEquivalent,
	nextDueAfter,
	yearlyCost,
} from "./subscriptions";

describe("nextDueAfter", () => {
	it("keeps the 31st after a short month", () => {
		expect(nextDueAfter("2026-01-31", "monthly", 31)).toBe("2026-02-28");
		expect(nextDueAfter("2026-02-28", "monthly", 31)).toBe("2026-03-31");
	});
	it("handles weekly, quarterly and yearly", () => {
		expect(nextDueAfter("2026-12-29", "weekly", 29)).toBe("2027-01-05");
		expect(nextDueAfter("2026-11-15", "quarterly", 15)).toBe("2027-02-15");
		expect(nextDueAfter("2028-02-29", "yearly", 29)).toBe("2029-02-28");
	});
});

describe("costs", () => {
	it("compares cycles by month and year", () => {
		expect(monthlyEquivalent(1_000, "weekly")).toBe(4_333);
		expect(monthlyEquivalent(36_000, "yearly")).toBe(3_000);
		expect(yearlyCost(5_490, "monthly")).toBe(65_880);
	});
});

describe("due dates", () => {
	it("lists every payment until a day, and counts days left", () => {
		expect(
			dueDatesUntil(
				{ nextDue: "2026-10-06", cycle: "weekly", dueDay: 6 },
				"2026-10-31",
			),
		).toEqual(["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
		expect(daysUntil("2026-10-21", "2026-10-17")).toBe(4);
		expect(daysUntil("2026-10-15", "2026-10-17")).toBe(-2);
	});
});
