import type { Category } from "@spendid/shared";
import { describe, expect, it } from "vitest";
import {
	coverageProblems,
	type Lookup,
	mentionedCategories,
	mentionedPeriods,
} from "./coverage";

const cat = (slug: string, name: string): Category =>
	({ id: `id-${slug}`, slug, name }) as Category;
const CATEGORIES = [
	cat("food", "Eating out"),
	cat("groceries", "Groceries"),
	cat("transport", "Transport"),
	cat("health", "Health"),
	cat("fitness", "Sports & fitness"),
	cat("bills", "Bills & utilities"),
	cat("other", "Other"),
];
const TODAY = "2026-10-18"; // a Sunday

describe("mentionedPeriods", () => {
	it.each([
		["How much did I spend last week?", ["last_week"]],
		["Berapa saya belanja minggu lepas?", ["last_week"]],
		["What did I spend yesterday?", ["yesterday"]],
		["Belanja semalam?", ["yesterday"]],
		["Compare this month with last month", ["this_month", "last_month"]],
		["Berapa untuk barang dapur bulan lepas?", ["last_month"]],
		["Spending in the last 7 days", ["last_7_days"]],
		["past 30 days on transport", ["last_30_days"]],
		["How much this year?", ["this_year"]],
		["Belanja tahun lepas", ["last_year"]],
		["What's safe to spend today?", ["today"]],
		["How much on Grab?", []],
	])("%s", (question, periods) => {
		expect(mentionedPeriods(question)).toEqual(periods);
	});
});

describe("mentionedCategories", () => {
	it.each([
		["How much on groceries last month?", ["groceries"]],
		["grocery this week", ["groceries"]],
		["more on groceries than eating out", ["groceries", "food"]],
		["health and fitness this month", ["health", "fitness"]],
		["Berapa untuk barang dapur?", ["groceries"]],
		["bil api air bulan ini, bills", ["bills"]],
		["anything other than that?", []],
		["How much on coffee?", []],
	])("%s", (question, slugs) => {
		expect(
			mentionedCategories(question, CATEGORIES).map((c) => c.slug),
		).toEqual(slugs);
	});
});

const problems = (question: string, lookups: Lookup[]) =>
	coverageProblems({ question, today: TODAY, categories: CATEGORIES, lookups });

describe("coverageProblems", () => {
	it("passes when the asked period was looked up exactly", () => {
		expect(
			problems("How much did I spend last week?", [
				{ from: "2026-10-05", to: "2026-10-11", groupBy: "category" },
			]),
		).toEqual([]);
	});

	it("rejects a right-looking total for the wrong week", () => {
		const out = problems("How much did I spend last week?", [
			{ from: "2026-10-12", to: "2026-10-18", groupBy: "category" },
		]);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatch(/last week \(2026-10-05 to 2026-10-11\)/);
	});

	it("accepts a longer lookup broken down finely enough to read the period off", () => {
		expect(
			problems("Compare this month with last month", [
				{ from: "2026-09-01", to: "2026-10-18", groupBy: "month" },
			]),
		).toEqual([]);
		expect(
			problems("How much did I spend last week?", [
				{ from: "2026-09-19", to: "2026-10-18", groupBy: "day" },
			]),
		).toEqual([]);
		expect(
			problems("How much did I spend last week?", [
				{ from: "2026-09-01", to: "2026-10-18", groupBy: "month" },
			]),
		).toHaveLength(1);
	});

	it("needs the category and the period in the same lookup", () => {
		expect(
			problems("How much on groceries last month?", [
				{
					from: "2026-09-01",
					to: "2026-09-30",
					groupBy: "category",
					categoryId: "id-groceries",
				},
			]),
		).toEqual([]);
		// Groceries this month and everything last month: both "covered", still the wrong number.
		const out = problems("How much on groceries last month?", [
			{
				from: "2026-10-01",
				to: "2026-10-18",
				groupBy: "category",
				categoryId: "id-groceries",
			},
			{ from: "2026-09-01", to: "2026-09-30", groupBy: "merchant" },
		]);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatch(/Groceries.*last month/);
	});

	it("a breakdown by category covers every category in it", () => {
		expect(
			problems("How much more on groceries than eating out this month?", [
				{ from: "2026-10-01", to: "2026-10-18", groupBy: "category" },
			]),
		).toEqual([]);
	});

	it("a period total must cover all spending, not one category", () => {
		expect(
			problems("How much did I spend this month?", [
				{
					from: "2026-10-01",
					to: "2026-10-18",
					groupBy: "category",
					categoryId: "id-food",
				},
			]),
		).toHaveLength(1);
	});

	it("a category the question hints at with everyday words counts ('eat out')", () => {
		expect(
			problems("How many times did I eat out this month?", [
				{
					from: "2026-10-01",
					to: "2026-10-18",
					groupBy: "list",
					categoryId: "id-food",
				},
			]),
		).toEqual([]);
	});

	it("the biggest expense needs a list sorted by size, or every match", () => {
		const newest: Lookup = {
			from: "2026-10-01",
			to: "2026-10-18",
			groupBy: "list",
			sort: "newest",
			complete: false,
		};
		expect(
			problems("What was my biggest expense this month?", [newest]),
		).toHaveLength(1);
		expect(
			problems("What was my biggest expense this month?", [
				{ ...newest, sort: "biggest" },
			]),
		).toEqual([]);
		expect(
			problems("Perbelanjaan paling mahal bulan ini?", [
				{ ...newest, complete: true },
			]),
		).toEqual([]);
		expect(
			problems("What's my cheapest purchase this month?", [
				{ ...newest, sort: "biggest" },
			]),
		).toHaveLength(1);
		// The biggest category or shop comes from a breakdown, not a list.
		expect(
			problems("Which category was my biggest this month?", [
				{ from: "2026-10-01", to: "2026-10-18", groupBy: "category" },
			]),
		).toEqual([]);
	});

	it("a spending question with a period but no lookup at all is a problem", () => {
		expect(problems("How much did I spend yesterday?", [])).toHaveLength(1);
	});

	it("leaves questions that aren't about spending alone", () => {
		expect(problems("Remind me about bills this week", [])).toEqual([]);
		expect(problems("Add a goal for a new car this year", [])).toEqual([]);
	});

	it("the budget overview answers today's and this month's questions", () => {
		expect(
			problems("What's safe to spend today?", [
				{ from: "2026-10-01", to: "2026-10-18", groupBy: "category" },
				{ from: "2026-10-18", to: "2026-10-18", groupBy: "category" },
			]),
		).toEqual([]);
	});
});
