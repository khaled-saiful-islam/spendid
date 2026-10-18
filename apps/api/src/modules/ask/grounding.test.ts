import { describe, expect, it } from "vitest";
import { ungroundedNumbers } from "./grounding";

const tools = [
	JSON.stringify({ total: 703.45, totalShown: "RM 703.45", expenses: 50 }),
	JSON.stringify({
		groups: [{ label: "Groceries", amount: 205.55, count: 2 }],
	}),
	JSON.stringify({ result: 5.67 }),
	JSON.stringify({ amount: 1234.5, shown: "RM 1,234.50" }),
];

describe("ungroundedNumbers", () => {
	it("passes amounts, percentages and counts that come from the tools", () => {
		expect(
			ungroundedNumbers(
				"You spent RM 703.45 in March over 50 expenses; groceries were RM 205.55 (about 5.7%), and RM1,234.50 once.",
				tools,
			),
		).toEqual([]);
	});

	it("accepts a tool number rounded the way people say it", () => {
		expect(
			ungroundedNumbers("About RM 703 so far, roughly 6%.", tools),
		).toEqual([]);
	});

	it("flags an amount, percentage or count that isn't in the data", () => {
		expect(
			ungroundedNumbers(
				"You spent RM 710.00 across 52 expenses, 7% on groceries.",
				tools,
			),
		).toEqual(["RM 710.00", "52 expenses", "7%"]);
	});

	it("flags amounts written in Malay answers too", () => {
		expect(
			ungroundedNumbers("Anda berbelanja RM 99.99 dalam 3 transaksi.", tools),
		).toEqual(["RM 99.99", "3 transaksi"]);
	});

	it("allows numbers the person gave in the question", () => {
		expect(
			ungroundedNumbers("If you save RM 200 a month, you'd have RM 2,400.", [
				...tools,
				"If I save RM 200 a month, how much in a year?",
				JSON.stringify({ result: 2400 }),
			]),
		).toEqual([]);
	});

	it("accepts a drop written as a positive amount", () => {
		expect(
			ungroundedNumbers("Eating out dropped by RM 153.80.", [
				JSON.stringify({ expression: "156.8 - 310.6", result: -153.8 }),
			]),
		).toEqual([]);
	});

	it("ignores dates, years and plain words with numbers", () => {
		expect(
			ungroundedNumbers(
				"On 18 October 2025, 3 days left, in week 42, your top 2 shops.",
				tools,
			),
		).toEqual([]);
	});

	it("reads other currencies and bare two-decimal amounts", () => {
		expect(
			ungroundedNumbers("The hotel was THB 3,000.00, about 390.50.", [
				JSON.stringify({ amount: 390.5, original: 3000 }),
			]),
		).toEqual([]);
		expect(ungroundedNumbers("That was 12.34 in total.", tools)).toEqual([
			"12.34",
		]);
	});
});
