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

	describe("earlier days", () => {
		// Saturday 17 October 2026.
		const today = "2026-10-17";
		const daysAgo = (text: string) => parseQuickEntry(text, today).daysAgo;

		it("reads 'N days ago' without taking N as the amount", () => {
			expect(parseQuickEntry("grab 9 3 days ago", today)).toMatchObject({
				amount: 9,
				daysAgo: 3,
				description: "Grab",
			});
			expect(daysAgo("makan 15 2 hari lepas")).toBe(2);
		});

		it("knows the day before yesterday in English and Malay", () => {
			expect(daysAgo("lunch 12 day before yesterday")).toBe(2);
			expect(daysAgo("nasi lemak 6 kelmarin")).toBe(2);
		});

		it("reads weekday names as the most recent one", () => {
			expect(daysAgo("petrol 80 on monday")).toBe(5);
			expect(daysAgo("petrol 80 thu")).toBe(2);
			expect(daysAgo("petrol 80 isnin")).toBe(5);
			// Today's own weekday is today; "last" means the week before.
			expect(daysAgo("lunch 12 saturday")).toBe(0);
			expect(daysAgo("lunch 12 last saturday")).toBe(7);
		});

		it("reads dates like '3 oct', 'oct 3' and '3/10'", () => {
			expect(parseQuickEntry("lunch 12 on 3 oct", today)).toMatchObject({
				amount: 12,
				daysAgo: 14,
				description: "Lunch",
			});
			expect(daysAgo("lunch rm12 oct 3")).toBe(14);
			// Both readings fit "12 oct 3"; day-before-month (the Malaysian way) wins.
			expect(parseQuickEntry("lunch 12 oct 3", today)).toMatchObject({
				amount: 3,
				daysAgo: 5,
			});
			expect(daysAgo("lunch 12 3 oktober")).toBe(14);
			expect(daysAgo("lunch 12 3/10")).toBe(14);
		});

		it("puts a date later in the year into last year", () => {
			expect(daysAgo("gift 50 25 dec")).toBe(296);
		});

		it("leaves a plain amount alone", () => {
			expect(parseQuickEntry("coffee 6.50", today)).toMatchObject({
				amount: 6.5,
				daysAgo: 0,
			});
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
