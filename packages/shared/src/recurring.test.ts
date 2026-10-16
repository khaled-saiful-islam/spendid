import { describe, expect, it } from "vitest";
import {
	addCadence,
	billsStillDue,
	type Charge,
	detectRecurring,
} from "./recurring";

const c = (
	merchant: string,
	day: string,
	amountMinor: number,
	billLike = true,
): Charge => ({
	merchant,
	merchantKey: merchant.toLowerCase(),
	amountMinor,
	day,
	categoryId: "cat",
	billLike,
});

describe("addCadence", () => {
	it("keeps the day of month, clamped to month end", () => {
		expect(addCadence("2026-01-31", "monthly")).toBe("2026-02-28");
		expect(addCadence("2026-10-16", "weekly")).toBe("2026-10-23");
		expect(addCadence("2026-10-16", "yearly")).toBe("2027-10-16");
	});
});

describe("detectRecurring", () => {
	it("finds a monthly subscription and its price rise", () => {
		const found = detectRecurring(
			[
				c("Netflix", "2026-07-03", 5490),
				c("Netflix", "2026-08-03", 5490),
				c("Netflix", "2026-09-03", 5490),
				c("Netflix", "2026-10-03", 6290),
			],
			"2026-10-16",
		);
		expect(found).toMatchObject([
			{
				merchant: "Netflix",
				cadence: "monthly",
				amountMinor: 6290,
				previousAmountMinor: 5490,
				nextDay: "2026-11-03",
			},
		]);
	});

	it("accepts two charges only when the amount is the same", () => {
		expect(
			detectRecurring(
				[c("Spotify", "2026-09-10", 1590), c("Spotify", "2026-10-10", 1590)],
				"2026-10-16",
			),
		).toHaveLength(1);
		expect(
			detectRecurring(
				[c("Jaya", "2026-09-10", 8420), c("Jaya", "2026-10-10", 13070)],
				"2026-10-16",
			),
		).toHaveLength(0);
		expect(
			detectRecurring(
				[
					c("Petrol", "2026-09-16", 6000, false),
					c("Petrol", "2026-10-13", 6000, false),
				],
				"2026-10-16",
			),
		).toHaveLength(0);
	});

	it("ignores irregular shops and cancelled subscriptions", () => {
		expect(
			detectRecurring(
				[
					c("Tealive", "2026-10-01", 900),
					c("Tealive", "2026-10-04", 900),
					c("Tealive", "2026-10-15", 900),
				],
				"2026-10-16",
			),
		).toHaveLength(0);
		expect(
			detectRecurring(
				[
					c("Gym", "2026-05-01", 9900),
					c("Gym", "2026-06-01", 9900),
					c("Gym", "2026-07-01", 9900),
				],
				"2026-10-16",
			),
		).toHaveLength(0);
	});
});

describe("billsStillDue", () => {
	it("counts what's still coming this month, not what's paid", () => {
		const recurring = detectRecurring(
			[
				c("Unifi", "2026-08-20", 12900),
				c("Unifi", "2026-09-20", 12900),
				c("Netflix", "2026-09-03", 5490),
				c("Netflix", "2026-10-03", 5490),
			],
			"2026-10-16",
		);
		expect(billsStillDue(recurring, "2026-10-16", "2026-10-31")).toEqual({
			minor: 12900,
			items: [{ merchant: "Unifi", day: "2026-10-20", amountMinor: 12900 }],
		});
	});
});
