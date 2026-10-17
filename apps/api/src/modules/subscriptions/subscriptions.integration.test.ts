import { createDb, transaction } from "@spendid/db";
import { type Category, nextDueAfter, type Transaction } from "@spendid/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { recurringFor } from "../insights/charges";
import { createCategoryRepository } from "../money/categories.repository";
import { createSubscriptionService } from "./subscriptions.service";

const url = testDbUrl();

/** YYYY-MM-DD in UTC (test people live in UTC), `days` from today. */
const dayFromToday = (days: number) =>
	new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!url)("subscriptions (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const categories = createCategoryRepository(db);
	const logged: { userId: string; merchant: string; amountMinor: number }[] =
		[];
	const service = createSubscriptionService({
		db,
		categories,
		addExpense: async (userId, input) => {
			logged.push({
				userId,
				merchant: input.merchant,
				amountMinor: input.amountMinor,
			});
			return { id: "x", ...input } as unknown as Transaction;
		},
	});
	let maya: string;
	let sam: string;
	let subs: Category;

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db, { currency: "MYR" });
		sam = await createPerson(db);
		const found = (await categories.listFor(maya)).find(
			(c) => c.slug === "subscriptions",
		);
		if (!found) throw new Error("subscriptions category missing");
		subs = found;
	});
	afterAll(() => database.close());

	const netflix = () => ({
		name: "Netflix",
		brand: "netflix",
		amountMinor: 5_490,
		currency: "MYR",
		cycle: "monthly" as const,
		nextDue: dayFromToday(3),
		remindDays: 5,
		categoryId: subs.id,
	});

	it("keeps unpaid payments aside, reminds in time, and moves on when paid", async () => {
		const sub = await service.create(maya, netflix());
		expect(sub.dueDay).toBe(Number(sub.nextDue.slice(8, 10)));

		expect((await service.remindersFor(maya)).map((s) => s.name)).toEqual([
			"Netflix",
		]);
		const before = await recurringFor(db, maya);
		const inThisMonth = sub.nextDue.slice(0, 7) === dayFromToday(0).slice(0, 7);
		if (inThisMonth)
			expect(before.billsDue.items.map((i) => i.merchant)).toContain("Netflix");

		const { subscription } = await service.markPaid(maya, sub.id, {
			amountMinor: 5_990,
		});
		expect(logged.at(-1)).toEqual({
			userId: maya,
			merchant: "Netflix",
			amountMinor: 5_990,
		});
		expect(subscription.nextDue > sub.nextDue).toBe(true);
		expect(subscription.lastPaidOn).toBe(dayFromToday(0));
		expect(await service.remindersFor(maya)).toEqual([]);
	});

	it("marks paid once, even when tapped twice at the same moment", async () => {
		const sub = await service.create(maya, {
			...netflix(),
			name: "Disney",
			brand: "disney",
		});
		const before = logged.length;
		const results = await Promise.allSettled([
			service.markPaid(maya, sub.id, {}),
			service.markPaid(maya, sub.id, {}),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
		expect(logged.length - before).toBe(1);
		const after = (await service.overview(maya)).active.find(
			(s) => s.id === sub.id,
		);
		// Moved on by exactly one cycle, not two.
		expect(after?.nextDue).toBe(
			nextDueAfter(sub.nextDue, sub.cycle, sub.dueDay),
		);
	});

	it("counts an expense logged by hand as paying it", async () => {
		const gym = await service.create(maya, {
			...netflix(),
			name: "Gym",
			brand: "gym",
			nextDue: dayFromToday(1),
		});
		const [tx] = await db
			.insert(transaction)
			.values({
				userId: maya,
				merchant: "GYM",
				amountMinor: 12_000,
				currency: "MYR",
				homeAmountMinor: 12_000,
				homeCurrency: "MYR",
				categoryId: subs.id,
				occurredAt: new Date(),
			})
			.returning({ id: transaction.id });
		await service.noticePayment(maya, tx?.id ?? "");
		const after = (await service.overview(maya)).active.find(
			(s) => s.id === gym.id,
		);
		expect((after?.nextDue ?? "") > gym.nextDue).toBe(true);
	});

	it("is private to its owner and can be cancelled and restored", async () => {
		const sub = await service.create(maya, {
			...netflix(),
			name: "Spotify",
			brand: "spotify",
		});
		await expect(service.markPaid(sam, sub.id, {})).rejects.toThrow();
		await expect(service.cancel(sam, sub.id)).rejects.toThrow();
		expect((await service.overview(sam)).active).toEqual([]);

		await service.cancel(maya, sub.id);
		const o = await service.overview(maya);
		expect(o.cancelled.map((s) => s.name)).toContain("Spotify");
		expect(o.active.map((s) => s.name)).not.toContain("Spotify");
		await service.restore(maya, sub.id);
		expect((await service.overview(maya)).active.map((s) => s.name)).toContain(
			"Spotify",
		);
	});

	it("refuses a category that isn't the person's", async () => {
		await expect(
			service.create(maya, {
				...netflix(),
				categoryId: "0193c0de-0000-7000-8000-000000000000",
			}),
		).rejects.toThrow();
	});
});
