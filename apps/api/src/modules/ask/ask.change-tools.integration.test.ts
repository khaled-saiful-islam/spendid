import { createDb, transaction } from "@spendid/db";
import type { AskAction, Category, Transaction } from "@spendid/shared";
import { DEFAULT_PREFS } from "@spendid/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createChallengeService } from "../delight/challenges.service";
import { createCategoryRepository } from "../money/categories.repository";
import { createPlanRepository } from "../money/plan.repository";
import { createSummaryService } from "../money/summary.service";
import { createSubscriptionService } from "../subscriptions/subscriptions.service";
import {
	type AskContext,
	createAskTools,
	pickAreas,
	type SideChannel,
	type ToolDeps,
} from "./ask.tools";

const url = testDbUrl();

describe("pickAreas", () => {
	it("finds the areas a question is about, in English and Malay", () => {
		const areas = (q: string) => [...pickAreas([q])].sort();
		expect(areas("yesterday's grab was 15 not 18")).toEqual([]);
		expect(areas("delete the duplicate coffee")).toEqual(["expenses"]);
		expect(areas("I paid Unifi")).toEqual(["subscriptions"]);
		expect(areas("make the laptop goal 6000")).toEqual(["goals"]);
		expect(areas("my salary is now 6000")).toEqual(["plan"]);
		expect(areas("start a no-spend weekend challenge")).toEqual(["challenges"]);
		expect(areas("tukar bahasa ke melayu")).toEqual(["expenses", "settings"]);
		expect(areas("muat turun data saya")).toEqual(["data"]);
		expect(areas("bahagi bil makan malam dengan Adam")).toEqual([
			"family",
			"subscriptions",
		]);
	});

	it("knows family names, attached receipts and the turns before", () => {
		expect(pickAreas(["split it with Adam"], { people: ["Adam"] })).toEqual(
			new Set(["family"]),
		);
		expect(pickAreas(["what about Adamson?"], { people: ["Adam"] })).toEqual(
			new Set(),
		);
		expect(pickAreas(["log this"], { hasReceipt: true })).toEqual(
			new Set(["receipt"]),
		);
		expect(pickAreas(["the second one", "cancel Netflix?"])).toEqual(
			new Set(["subscriptions"]),
		);
	});
});

describe.skipIf(!url)("ask change tools (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const categoryRepo = createCategoryRepository(db);
	const subscriptions = createSubscriptionService({
		db,
		categories: categoryRepo,
		addExpense: async (_u, input) =>
			({ id: "x", ...input }) as unknown as Transaction,
	});
	let maya: string;
	let sam: string;
	let categories: Category[];
	const today = new Date().toISOString().slice(0, 10);
	const yesterday = new Date(Date.now() - 86_400_000)
		.toISOString()
		.slice(0, 10);

	const family: ToolDeps["family"] = {
		overview: async () => ({
			people: [
				{
					userId: "adam-id",
					name: "Adam Rahman",
					relation: "spouse",
					since: today,
					theyShare: { level: "categories", paused: false, updatedAt: today },
					iShare: { level: "totals", paused: false, updatedAt: today },
				},
			],
			invites: [],
		}),
	};

	function run(
		userId: string,
		extra: Partial<AskContext> = {},
	): {
		call: (name: string, input: unknown) => Promise<string>;
		actions: AskAction[];
	} {
		const side: SideChannel = { charts: [], drafts: [], actions: [] };
		const tools = createAskTools(
			{
				db,
				summary: createSummaryService(db),
				plan: createPlanRepository(db),
				subscriptions,
				challenges: createChallengeService(db),
				family,
				jars: { overview: async () => ({ jars: [], myGoals: [] }) },
				notifier: { prefs: async () => DEFAULT_PREFS },
			},
			{
				userId,
				timeZone: "UTC",
				homeCurrency: "MYR",
				categories,
				name: "Maya",
				...extra,
			},
			side,
		);
		return {
			actions: side.actions,
			call: (name, input) => {
				const found = tools.find((t) => t.name === name) as unknown as
					| { invoke: (i: unknown) => Promise<string> }
					| undefined;
				if (!found) throw new Error(`no tool ${name}`);
				return found.invoke(input);
			},
		};
	}

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db);
		sam = await createPerson(db);
		categories = await categoryRepo.listFor(maya);
		const id = (slug: string) =>
			categories.find((c) => c.slug === slug)?.id ?? "";
		const row = (
			userId: string,
			slug: string,
			merchant: string,
			minor: number,
			day: string,
		) => ({
			userId,
			categoryId: id(slug),
			merchant,
			amountMinor: minor,
			currency: "MYR",
			homeAmountMinor: minor,
			homeCurrency: "MYR",
			occurredAt: new Date(`${day}T10:00:00Z`),
		});
		await db
			.insert(transaction)
			.values([
				row(maya, "transport", "Grab", 1800, yesterday),
				row(maya, "food", "Kopi", 680, today),
				row(maya, "food", "Kopi", 680, yesterday),
				row(sam, "transport", "Grab", 1800, yesterday),
			]);
	});
	afterAll(() => database.close());

	it("fixes one expense with an undo, and only the person's own", async () => {
		const { call, actions } = run(maya);
		await call("propose_expense_change", {
			shop: "grab",
			day: yesterday,
			newAmount: 15,
			newCategory: "food",
		});
		const card = actions[0];
		expect(card).toMatchObject({
			kind: "expense-edit",
			before: { amountMinor: 1800, categoryName: "Transport" },
			after: { amountMinor: 1500, categoryName: "Eating out" },
			patch: { amountMinor: 1500 },
			undo: { amountMinor: 1800 },
		});
		// The card never changes anything by itself.
		const { call: callSam } = run(sam);
		expect(
			await callSam("find_expenses", { from: yesterday, to: yesterday }),
		).toContain("18");
	});

	it("reads 'change X to 4' as the new amount when 4 isn't its current amount", async () => {
		const { call, actions } = run(maya);
		await call("propose_expense_change", {
			shop: "grab",
			amount: 16,
			latest: true,
		});
		expect(actions[0]).toMatchObject({
			kind: "expense-edit",
			before: { amountMinor: 1800 },
			after: { amountMinor: 1600 },
		});
	});

	it("asks which one when several match, or takes the latest when told", async () => {
		const { call, actions } = run(maya);
		const out = JSON.parse(
			await call("propose_expense_change", { shop: "kopi", remove: true }),
		);
		expect(out.matches).toHaveLength(2);
		expect(actions).toHaveLength(0);
		await call("propose_expense_change", {
			shop: "kopi",
			latest: true,
			remove: true,
		});
		expect(actions[0]).toMatchObject({
			kind: "expense-delete",
			look: { merchant: "Kopi", day: today },
		});
	});

	it("finds an expense by amount even when 20 newer ones came after it", async () => {
		const lee = await createPerson(db);
		const food = categories.find((c) => c.slug === "food")?.id ?? "";
		const shopping = categories.find((c) => c.slug === "shopping")?.id ?? "";
		const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
		const base = {
			userId: lee,
			currency: "MYR",
			homeCurrency: "MYR",
		};
		await db.insert(transaction).values([
			{
				...base,
				categoryId: shopping,
				merchant: "Shoes",
				amountMinor: 12_800,
				homeAmountMinor: 12_800,
				occurredAt: at(20),
			},
			...Array.from({ length: 25 }, (_, i) => ({
				...base,
				categoryId: food,
				merchant: `Lunch ${i + 1}`,
				amountMinor: 500,
				homeAmountMinor: 500,
				occurredAt: at(i % 5),
			})),
		]);
		const { call, actions } = run(lee);
		await call("propose_expense_change", { amount: 128, remove: true });
		expect(actions[0]).toMatchObject({
			kind: "expense-delete",
			look: { merchant: "Shoes" },
		});
	});

	it("marks paid, changes and cancels a tracked subscription", async () => {
		await subscriptions.create(maya, {
			name: "Netflix",
			brand: "netflix",
			amountMinor: 5490,
			currency: "MYR",
			cycle: "monthly",
			nextDue: today,
			remindDays: 3,
			categoryId: categories.find((c) => c.slug === "subscriptions")?.id ?? "",
		});
		const { call, actions } = run(maya);
		await call("propose_subscription_change", {
			name: "netflix",
			action: "paid",
		});
		await call("propose_subscription_change", {
			name: "Netflix",
			action: "change",
			newAmount: 59.9,
		});
		await call("propose_subscription_change", {
			name: "Netflix",
			action: "cancel",
		});
		expect(actions.map((a) => a.kind)).toEqual([
			"subscription-paid",
			"subscription-edit",
			"subscription-cancel",
		]);
		expect(actions[1]).toMatchObject({
			before: { amountMinor: 5490 },
			input: { amountMinor: 5990, name: "Netflix" },
		});
		const missing = JSON.parse(
			await call("propose_subscription_change", {
				name: "Spotify",
				action: "cancel",
			}),
		);
		expect(missing.subscriptions).toEqual(["Netflix"]);
	});

	it("changes, archives and refuses no-op goal changes", async () => {
		const plan = createPlanRepository(db);
		await plan.createGoal(maya, {
			name: "Laptop",
			emoji: "💻",
			targetMinor: 500_000,
		});
		const { call, actions } = run(maya);
		await call("propose_goal_change", {
			goal: "laptop",
			newTarget: 6000,
			byYear: 2099,
			byMonth: 6,
		});
		expect(actions[0]).toMatchObject({
			kind: "goal-edit",
			before: { targetMinor: 500_000, targetDate: null },
			input: { targetMinor: 600_000, targetDate: "2099-06-30", name: "Laptop" },
		});
		expect(await call("propose_goal_change", { goal: "laptop" })).toMatch(
			/Nothing to change/,
		);
		await call("propose_goal_change", { goal: "laptop", archive: true });
		expect(actions[1]?.kind).toBe("goal-archive");
	});

	it("changes income and budget style, and removes a limit", async () => {
		const { call, actions } = run(maya);
		await call("propose_plan_change", {
			monthlyIncome: 7000,
			style: "envelopes",
		});
		expect(actions[0]).toMatchObject({
			kind: "plan",
			before: { incomeMinor: 600_000 },
			input: { monthlyIncomeMinor: 700_000, budgetMethod: "envelope" },
		});
		await call("propose_budget", { category: "food", remove: true });
		expect(actions[1]).toMatchObject({ kind: "budget", limitMinor: null });
	});

	it("starts a challenge with a suggested cap and stops a running one", async () => {
		const { call, actions } = run(maya);
		await call("propose_challenge", { challenge: "eating-out cap" });
		expect(actions[0]).toMatchObject({
			kind: "challenge-start",
			challenge: "eat-out-cap",
		});
		await createChallengeService(db).start(maya, { kind: "log-daily" });
		await call("propose_challenge", { challenge: "log-daily", stop: true });
		expect(actions[1]).toMatchObject({
			kind: "challenge-stop",
			challenge: "log-daily",
		});
		expect(await call("propose_challenge", { challenge: "knitting" })).toMatch(
			/Unknown challenge/,
		);
	});

	it("changes sharing, invites, and splits a bill with people in the circle", async () => {
		const { call, actions } = run(maya);
		await call("propose_sharing", { person: "adam", level: "categories" });
		await call("propose_invite", {
			relation: "sibling",
			email: "sis@example.com",
		});
		await call("propose_split", {
			title: "Dinner",
			total: 120,
			people: ["Adam", "Sam"],
		});
		expect(actions[0]).toMatchObject({
			kind: "share",
			personId: "adam-id",
			before: { level: "totals" },
			level: "categories",
		});
		expect(actions[1]).toMatchObject({
			kind: "invite",
			relation: "sibling",
			level: "totals",
		});
		const split = actions[2];
		expect(split?.kind).toBe("split");
		if (split?.kind !== "split") return;
		expect(split.input.people.map((p) => [p.name, p.userId])).toEqual([
			["Maya", maya],
			["Adam Rahman", "adam-id"],
			["Sam", null],
		]);
		expect(split.shares.reduce((s, x) => s + x.totalMinor, 0)).toBe(12_000);
	});

	it("splits an attached receipt by its lines, tax included", async () => {
		const receipt = {
			id: "8f14e45f-ceea-467a-9575-1c7c4f6c2a01",
			draft: {
				merchant: "Madam Kwan's",
				date: today,
				currency: "MYR",
				totalMinor: 6_600,
				taxMinor: 600,
				categorySlug: "food",
				items: [
					{
						name: "Nasi lemak",
						quantity: 1,
						unitPriceMinor: 2_500,
						totalMinor: 2_500,
						warrantyMonths: null,
					},
					{
						name: "Teh tarik",
						quantity: 2,
						unitPriceMinor: 1_750,
						totalMinor: 3_500,
						warrantyMonths: null,
					},
				],
			},
		};
		const { call, actions } = run(maya, { receipt });
		await call("propose_split", { people: ["Adam"], fromReceipt: true });
		await call("propose_receipt_review", {});
		const split = actions[0];
		if (split?.kind !== "split") throw new Error("no split");
		expect(split.input).toMatchObject({
			title: "Madam Kwan's",
			adjustMinor: 600,
			receiptId: receipt.id,
		});
		expect(split.shares.map((s) => s.totalMinor)).toEqual([3_300, 3_300]);
		expect(actions[1]).toMatchObject({ kind: "receipt", totalMinor: 6_600 });
	});

	it("changes settings and prepares a data download", async () => {
		const { call, actions } = run(maya);
		await call("propose_setting", { setting: "language", language: "malay" });
		await call("propose_setting", {
			setting: "quiet hours",
			quietStart: 22,
			quietEnd: 7,
		});
		await call("propose_setting", {
			setting: "email",
			email: "weekly",
			on: false,
		});
		await call("propose_export", {});
		expect(
			actions.map((a) => (a.kind === "setting" ? a.change : a.kind)),
		).toEqual([
			{ setting: "language", locale: "ms" },
			{ setting: "quiet-hours", start: 22, end: 7 },
			{ setting: "email", group: "weekly", on: false },
			"export",
		]);
	});

	it("gives the model only the everyday tools plus the areas asked about", () => {
		const side: SideChannel = { charts: [], drafts: [], actions: [] };
		const names = (areas: Set<"expenses" | "family">) =>
			createAskTools(
				{
					db,
					summary: createSummaryService(db),
					plan: createPlanRepository(db),
					family,
				},
				{ userId: maya, timeZone: "UTC", homeCurrency: "MYR", categories },
				side,
				areas,
			).map((t) => t.name);
		const everyday = names(new Set());
		expect(everyday).toContain("propose_goal");
		expect(everyday).not.toContain("propose_expense_change");
		const fix = names(new Set(["expenses"]));
		expect(fix).toContain("propose_expense_change");
		expect(fix).not.toContain("propose_goal");
		expect(names(new Set(["family"]))).toEqual(
			expect.arrayContaining([
				"propose_split",
				"propose_sharing",
				"propose_goal_deposit",
			]),
		);
	});
});
