import { describe, expect, it } from "vitest";
import { ProfileInputSchema } from "./profile";

const valid = {
	name: "Maya",
	homeCurrency: "myr",
	locale: "en",
	timeZone: "Asia/Kuala_Lumpur",
	monthlyIncomeMinor: 650_000,
	budgetMethod: "fifty_thirty_twenty",
};

describe("ProfileInputSchema", () => {
	it("accepts a real profile and normalises the currency code", () => {
		expect(ProfileInputSchema.parse(valid).homeCurrency).toBe("MYR");
	});

	it("rejects made-up currencies and time zones", () => {
		expect(
			ProfileInputSchema.safeParse({ ...valid, homeCurrency: "ZZZ" }).success,
		).toBe(false);
		expect(
			ProfileInputSchema.safeParse({ ...valid, timeZone: "Mars/Base" }).success,
		).toBe(false);
	});

	it("rejects fractional or negative income", () => {
		expect(
			ProfileInputSchema.safeParse({ ...valid, monthlyIncomeMinor: 12.5 })
				.success,
		).toBe(false);
		expect(
			ProfileInputSchema.safeParse({ ...valid, monthlyIncomeMinor: -1 })
				.success,
		).toBe(false);
	});
});
