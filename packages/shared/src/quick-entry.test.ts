import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "./quick-entry";

describe("parseQuickEntry", () => {
	it("reads shorthand like 'coffee 6.50'", () => {
		expect(parseQuickEntry("coffee 6.50")).toEqual({
			amount: 6.5,
			currency: null,
			description: "Coffee",
			categorySlug: "food",
			daysAgo: 0,
		});
	});

	it("understands currency words and symbols", () => {
		expect(parseQuickEntry("rm12 grab to office")).toMatchObject({
			amount: 12,
			currency: "MYR",
			categorySlug: "transport",
		});
		expect(parseQuickEntry("hotel €120")).toMatchObject({
			amount: 120,
			currency: "EUR",
			categorySlug: "travel",
		});
		expect(parseQuickEntry("5 USD netflix")).toMatchObject({
			amount: 5,
			currency: "USD",
			categorySlug: "subscriptions",
		});
	});

	it("handles thousands separators and comma decimals", () => {
		expect(parseQuickEntry("rent 1,250")?.amount).toBe(1250);
		expect(parseQuickEntry("rent 1,250.50")?.amount).toBe(1250.5);
		expect(parseQuickEntry("brot 3,20")?.amount).toBe(3.2);
	});

	it("notices 'yesterday' and removes it from the description", () => {
		expect(parseQuickEntry("dinner yesterday 45")).toMatchObject({
			daysAgo: 1,
			description: "Dinner",
			amount: 45,
		});
	});

	it("drops stray punctuation around the description", () => {
		expect(parseQuickEntry("Lunch, 20").description).toBe("Lunch");
		expect(parseQuickEntry("coffee - 6.50.").description).toBe("Coffee");
	});

	it("leaves the amount empty when there is no number", () => {
		expect(parseQuickEntry("groceries")).toMatchObject({
			amount: null,
			categorySlug: "groceries",
		});
	});
});
