import { createDb, profile, transaction } from "@spendid/db";
import type { Category } from "@spendid/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createPlanRepository } from "../money/plan.repository";
import { createSummaryService } from "../money/summary.service";
import { createAskTools, type SideChannel } from "./ask.tools";

const url = testDbUrl();
const KL = "Asia/Kuala_Lumpur";

/**
 * The red line: every number Ask gives must be complete and exact. A fixed month of spending
 * in Kuala Lumpur time, where every right answer is known in advance.
 *
 * March 2025 (KL days): 40 shops at RM 1.00 (shopping), groceries 85.40 + 120.15, eating out
 * 6.80 × 3 + 12.50 + a 7.00 snack at 00:30 on 1 March, Grab 18.00 + 9.50, a Bangkok hotel of
 * THB 3,000.00 that cost RM 390.50. Plus a removed RM 50.00 lunch, and a 25.00 supper at 00:30
 * on 1 April (April, not March). January 1 to February 14: a RM 2.00 bus every day.
 */
const MARCH_TOTAL = 703.45;
const MARCH_COUNT = 50;

describe.skipIf(!url)("ask accuracy (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	let me: string;
	let categories: Category[];

	const toolsFor = (today?: string) => {
		const side: SideChannel = { charts: [], drafts: [], actions: [] };
		const all = createAskTools(
			{ db, summary: createSummaryService(db), plan: createPlanRepository(db) },
			{ userId: me, timeZone: KL, homeCurrency: "MYR", categories, today },
			side,
		);
		const run = async (name: string, input: unknown) => {
			const found = all.find((t) => t.name === name) as unknown as
				| { invoke: (i: unknown) => Promise<string> }
				| undefined;
			if (!found) throw new Error(`no tool ${name}`);
			const out = await found.invoke(input).catch((e: Error) => e.message);
			try {
				return JSON.parse(out);
			} catch {
				return { text: out };
			}
		};
		return { run, side };
	};
	const march = { from: "2025-03-01", to: "2025-03-31" };

	beforeAll(async () => {
		await seedCategories(db);
		me = await createPerson(db);
		categories = await createCategoryRepository(db).listFor(me);
		const id = (slug: string) =>
			categories.find((c) => c.slug === slug)?.id ?? "";
		const at = (iso: string) => new Date(iso);
		const row = (
			slug: string,
			merchant: string,
			minor: number,
			when: Date,
			extra: Partial<typeof transaction.$inferInsert> = {},
		) => ({
			userId: me,
			categoryId: id(slug),
			merchant,
			amountMinor: minor,
			currency: "MYR",
			homeAmountMinor: minor,
			homeCurrency: "MYR",
			occurredAt: when,
			...extra,
		});
		const noonKl = (day: string) => at(`${day}T04:00:00Z`);
		const shops = Array.from({ length: 40 }, (_, i) =>
			row(
				"shopping",
				`Shop ${String(i + 1).padStart(2, "0")}`,
				100,
				noonKl("2025-03-10"),
			),
		);
		const buses = Array.from({ length: 45 }, (_, i) => {
			const d = new Date(Date.UTC(2025, 0, 1 + i, 4));
			return row("transport", "Bus", 200, d);
		});
		await db.insert(transaction).values([
			...shops,
			...buses,
			row("groceries", "Jaya Grocer", 8540, noonKl("2025-03-05")),
			row("groceries", "Lotus's", 12015, noonKl("2025-03-20")),
			row("food", "Kopi", 680, noonKl("2025-03-02")),
			row("food", "Kopi", 680, noonKl("2025-03-03")),
			row("food", "Kopi", 680, noonKl("2025-03-04")),
			row("food", "Nasi lemak", 1250, noonKl("2025-03-15")),
			// 00:30 on 1 March in KL is still 28 February in UTC.
			row("food", "Midnight snack", 700, at("2025-02-28T16:30:00Z")),
			// 00:30 on 1 April in KL is still 31 March in UTC.
			row("food", "Late supper", 2500, at("2025-03-31T16:30:00Z")),
			row("transport", "Grab", 1800, noonKl("2025-03-07")),
			row("transport", "Grab", 950, noonKl("2025-03-08")),
			row("travel", "Hotel Bangkok", 300_000, noonKl("2025-03-22"), {
				currency: "THB",
				homeAmountMinor: 39_050,
			}),
			row("food", "Deleted lunch", 5000, noonKl("2025-03-12"), {
				deletedAt: new Date(),
			}),
		]);
	});

	afterAll(() => database.close());

	it("a month's total covers every expense, even with more than 31 shops", async () => {
		const { run } = toolsFor();
		const out = await run("spending_totals", { ...march, groupBy: "merchant" });
		expect(out.total).toBe(MARCH_TOTAL);
		expect(out.expenses).toBe(MARCH_COUNT);
		expect(out.allGroups).toBe(47);
		expect(out.groups).toHaveLength(31);
		expect(out.note).toMatch(/31 of 47/);
	});

	it("grouping by day over many weeks still totals every day", async () => {
		const { run } = toolsFor();
		const out = await run("spending_totals", {
			from: "2025-01-01",
			to: "2025-02-28",
			groupBy: "day",
		});
		expect(out.total).toBe(90);
		expect(out.expenses).toBe(45);
	});

	it("days follow the person's time zone, not the server's", async () => {
		const { run } = toolsFor();
		const food = await run("spending_totals", {
			...march,
			groupBy: "category",
			category: "food",
		});
		expect(food.total).toBe(39.9);
		const april1 = await run("spending_totals", {
			from: "2025-04-01",
			to: "2025-04-01",
			groupBy: "day",
		});
		expect(april1.total).toBe(25);
	});

	it("removed expenses never count, and are reported apart so the change can be explained", async () => {
		const { run } = toolsFor();
		const out = await run("spending_totals", { ...march, groupBy: "category" });
		expect(out.total).toBe(MARCH_TOTAL);
		expect(out.removed).toEqual(
			expect.objectContaining({ expenses: 1, total: 50 }),
		);
		const found = await run("find_expenses", { ...march, search: "Deleted" });
		expect(found.matching).toBe(0);
	});

	it("foreign spending counts at what it cost in the home currency", async () => {
		const { run } = toolsFor();
		const out = await run("spending_totals", {
			...march,
			groupBy: "category",
			category: "travel",
		});
		expect(out.total).toBe(390.5);
	});

	it("category names are matched forgivingly, and the one used is named", async () => {
		const { run } = toolsFor();
		for (const word of ["groceries", "grocery", "Groceries", "GROCERIES"]) {
			const out = await run("spending_totals", {
				...march,
				groupBy: "category",
				category: word,
			});
			expect(out.total, word).toBe(205.55);
			expect(out.category, word).toBe("Groceries");
		}
		const eatingOut = await run("spending_totals", {
			...march,
			groupBy: "merchant",
			category: "Eating out",
		});
		expect(eatingOut.total).toBe(39.9);
	});

	it("a word that isn't a category is refused, never answered as zero", async () => {
		const { run } = toolsFor();
		for (const word of ["coffee", "car insurance", "xyz"]) {
			const out = await run("spending_totals", {
				...march,
				groupBy: "category",
				category: word,
			});
			expect(out.total, word).toBeUndefined();
			expect(out.error, word).toMatch(/isn't a category/);
		}
	});

	it("a list says how many match and their total, not just the ones listed", async () => {
		const { run } = toolsFor();
		const out = await run("find_expenses", {
			...march,
			search: "Shop",
			limit: 10,
		});
		expect(out.expenses).toHaveLength(10);
		expect(out.matching).toBe(40);
		expect(out.matchingTotal).toBe(40);
		expect(out.more).toBe(true);
		const grab = await run("find_expenses", { ...march, search: "grab" });
		expect(grab.matching).toBe(2);
		expect(grab.matchingTotal).toBe(27.5);
		expect(grab.more).toBe(false);
		expect(grab.shops).toEqual(["Grab"]);
	});

	it("expenses can be found by amount, wherever they are in the month", async () => {
		const { run } = toolsFor();
		const exact = await run("find_expenses", { ...march, amount: 120.15 });
		expect(exact.matching).toBe(1);
		expect(exact.expenses[0].merchant).toBe("Lotus's");
		const range = await run("find_expenses", {
			...march,
			minAmount: 18,
			maxAmount: 100,
		});
		expect(range.expenses.map((e: { merchant: string }) => e.merchant)).toEqual(
			["Grab", "Jaya Grocer"],
		);
	});

	it("'over' an amount leaves that amount out; 'at least' counts it", async () => {
		const { run } = toolsFor();
		const over = await run("find_expenses", { ...march, over: 85.4 });
		expect(over.matching).toBe(2);
		expect(over.matchingTotal).toBe(510.65);
		const atLeast = await run("find_expenses", { ...march, minAmount: 85.4 });
		expect(atLeast.matching).toBe(3);
		const under = await run("find_expenses", { ...march, under: 6.8 });
		expect(under.matching).toBe(40);
	});

	it("the biggest expenses can be listed first, wherever they are in the month", async () => {
		const { run } = toolsFor();
		const out = await run("find_expenses", {
			...march,
			sort: "biggest",
			limit: 3,
		});
		expect(out.expenses.map((e: { merchant: string }) => e.merchant)).toEqual([
			"Hotel Bangkok",
			"Lotus's",
			"Jaya Grocer",
		]);
		expect(out.more).toBe(true);
		const smallest = await run("find_expenses", {
			...march,
			sort: "smallest",
			limit: 1,
		});
		expect(smallest.expenses[0].amount).toBe(1);
	});

	it("named periods are worked out by the server, in the person's days", async () => {
		const { run } = toolsFor("2025-04-10");
		const out = await run("spending_totals", {
			period: "last_month",
			groupBy: "category",
		});
		expect(out.from).toBe("2025-03-01");
		expect(out.to).toBe("2025-03-31");
		expect(out.total).toBe(MARCH_TOTAL);
	});

	it("impossible or backwards dates are refused with a clear message", async () => {
		const { run } = toolsFor();
		const bad = await run("spending_totals", {
			from: "2025-02-30",
			to: "2025-03-31",
			groupBy: "category",
		});
		expect(bad.total).toBeUndefined();
		expect(JSON.stringify(bad)).toMatch(/date/i);
		const backwards = await run("spending_totals", {
			from: "2025-03-31",
			to: "2025-03-01",
			groupBy: "category",
		});
		expect(backwards.total).toBeUndefined();
		expect(JSON.stringify(backwards)).toMatch(/before|after/i);
		const none = await run("spending_totals", { groupBy: "category" });
		expect(none.total).toBeUndefined();
	});

	it("a chart only shows numbers that came from the tools", async () => {
		const { run, side } = toolsFor();
		await run("spending_totals", { ...march, groupBy: "category" });
		const made = await run("show_chart", {
			kind: "bar",
			title: "Made up",
			points: [{ label: "Groceries", value: 999.99 }],
		});
		expect(side.charts).toHaveLength(0);
		expect(made.text).toMatch(/not from/i);
		await run("show_chart", {
			kind: "bar",
			title: "March",
			points: [
				{ label: "Groceries", value: 205.55 },
				{ label: "Travel", value: 390.5 },
			],
		});
		expect(side.charts).toHaveLength(1);
	});

	it("each lookup is recorded with its exact days and category, for the coverage check", async () => {
		const { run, side } = toolsFor("2025-04-10");
		await run("spending_totals", {
			period: "last_month",
			groupBy: "merchant",
			category: "grocery",
		});
		await run("find_expenses", { ...march, over: 100 });
		await run("spending_totals", {
			groupBy: "category",
			category: "coffee",
			...march,
		});
		expect(side.lookups).toEqual([
			{
				from: "2025-03-01",
				to: "2025-03-31",
				groupBy: "merchant",
				categoryId: categories.find((c) => c.slug === "groceries")?.id,
			},
			{
				from: "2025-03-01",
				to: "2025-03-31",
				groupBy: "list",
				sort: "newest",
				complete: true,
			},
		]);
	});

	it("calculate does exact money arithmetic", async () => {
		const { run } = toolsFor();
		expect(
			(await run("calculate", { expression: "85.40 + 120.15" })).result,
		).toBe(205.55);
		expect((await run("calculate", { expression: "703.45 / 31" })).result).toBe(
			22.69,
		);
		expect((await run("calculate", { expression: "1 / 0" })).error).toMatch(
			/zero/i,
		);
	});

	it("pay yourself first: the plan names every transfer and what's left", async () => {
		const payer = await createPerson(db, { incomeMinor: 400_000 });
		await db
			.update(profile)
			.set({ budgetMethod: "pay_yourself_first" })
			.where(eq(profile.userId, payer));
		const plan = createPlanRepository(db);
		await plan.setTransfers(payer, [
			{ name: "Savings", amountMinor: 50_000 },
			{ name: "Mum", amountMinor: 30_000 },
		]);
		const side: SideChannel = { charts: [], drafts: [], actions: [] };
		const tool = createAskTools(
			{ db, summary: createSummaryService(db), plan },
			{ userId: payer, timeZone: KL, homeCurrency: "MYR", categories },
			side,
		).find((t) => t.name === "budget_overview") as unknown as {
			invoke: (i: unknown) => Promise<string>;
		};
		const out = JSON.parse(await tool.invoke({}));
		expect(out.budgetStyle).toBe("pay yourself first");
		expect(out.monthlyIncome).toBe(4000);
		expect(out.monthlyTransfersOutFirst).toEqual([
			{ name: "Savings", amount: 500 },
			{ name: "Mum", amount: 300 },
		]);
		expect(out.monthlyTransfersTotal).toBe(800);
		expect(out.incomeLeftAfterTransfers).toBe(3200);
		expect(out.leftThisMonth).toBe(3200);
		expect(out.keptAsideForSavings).toBeUndefined();
		expect(side.planRead).toBe(true);

		// Another plan says plainly there are no transfers, so none get made up.
		await db
			.update(profile)
			.set({ budgetMethod: "envelope" })
			.where(eq(profile.userId, payer));
		const other = JSON.parse(await tool.invoke({}));
		expect(other.budgetStyle).toBe("envelopes");
		expect(other.monthlyTransfers).toMatch(/^none/);
		expect(other.monthlyTransfersOutFirst).toBeUndefined();
	});
});
