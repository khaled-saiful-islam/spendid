import { createDb, transaction } from "@spendid/db";
import type { Category } from "@spendid/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createPlanRepository } from "../money/plan.repository";
import { createSummaryService } from "../money/summary.service";
import { createAskTools, type SideChannel } from "./ask.tools";

const url = testDbUrl();

describe.skipIf(!url)("ask tools (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	let maya: string;
	let sam: string;
	let categories: Category[];
	const today = new Date().toISOString().slice(0, 10);

	const toolsFor = (
		userId: string,
		side: SideChannel = { charts: [], drafts: [] },
	) => {
		const all = createAskTools(
			{ db, summary: createSummaryService(db), plan: createPlanRepository(db) },
			{ userId, timeZone: "UTC", homeCurrency: "MYR", categories },
			side,
		);
		/** Runs one tool by name, the way the agent would. */
		return (name: string, input: unknown): Promise<string> => {
			const found = all.find((t) => t.name === name) as unknown as
				| { invoke: (i: unknown) => Promise<string> }
				| undefined;
			if (!found) throw new Error(`no tool ${name}`);
			return found.invoke(input);
		};
	};

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db);
		sam = await createPerson(db);
		categories = await createCategoryRepository(db).listFor(maya);
		const id = (slug: string) =>
			categories.find((c) => c.slug === slug)?.id ?? "";
		const row = (
			userId: string,
			slug: string,
			merchant: string,
			minor: number,
		) => ({
			userId,
			categoryId: id(slug),
			merchant,
			amountMinor: minor,
			currency: "MYR",
			homeAmountMinor: minor,
			homeCurrency: "MYR",
			occurredAt: new Date(),
		});
		await db
			.insert(transaction)
			.values([
				row(maya, "food", "Nasi lemak", 1250),
				row(maya, "food", "Kopi", 680),
				row(maya, "transport", "Grab", 1800),
				row(sam, "food", "Sam's secret dinner", 99_900),
			]);
	});

	afterAll(() => database.close());

	it("totals spending by category for the right person only", async () => {
		const out = JSON.parse(
			await toolsFor(maya)("spending_totals", {
				from: today,
				to: today,
				groupBy: "category",
			}),
		);
		expect(out.total).toBe(37.3);
		expect(out.groups).toContainEqual(
			expect.objectContaining({
				label: "Eating out",
				amount: 19.3,
				shown: "RM 19.30",
				count: 2,
			}),
		);
		expect(JSON.stringify(out)).not.toContain("secret");
	});

	it("finds expenses by a word in the shop name", async () => {
		const out = JSON.parse(
			await toolsFor(maya)("find_expenses", {
				from: today,
				to: today,
				search: "grab",
				limit: 5,
			}),
		);
		expect(out.expenses.map((e: { merchant: string }) => e.merchant)).toEqual([
			"Grab",
		]);
	});

	it("turns logged purchases into cards to confirm, never saved expenses", async () => {
		const side: SideChannel = { charts: [], drafts: [] };
		const reply = await toolsFor(maya, side)("propose_expenses", {
			expenses: [
				{
					amount: 12,
					currency: null,
					description: "lunch",
					category: "food",
					daysAgo: 1,
				},
			],
		});
		expect(reply).toMatch(/NOT saved/);
		expect(side.drafts).toEqual([
			expect.objectContaining({
				amountMinor: 1200,
				currency: "MYR",
				merchant: "Lunch",
				daysAgo: 1,
			}),
		]);
	});

	it("shows at most two charts per answer", async () => {
		const side: SideChannel = { charts: [], drafts: [] };
		const call = toolsFor(maya, side);
		const chart = {
			kind: "bar" as const,
			title: "T",
			points: [{ label: "A", value: 1.5 }],
		};
		for (let i = 0; i < 3; i++) await call("show_chart", chart);
		expect(side.charts).toHaveLength(2);
		expect(side.charts[0]?.points[0]?.value).toBe(150);
	});
});
