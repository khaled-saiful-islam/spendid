import { createDb, transaction } from "@spendid/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createChallengeService } from "./challenges.service";

const url = testDbUrl();

describe.skipIf(!url)("challenges (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const challenges = createChallengeService(db);
	let maya: string;
	let sam: string;

	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db, { currency: "MYR" });
		sam = await createPerson(db);
	});
	afterAll(() => database.close());

	it("judges a shopping pause from real spending, and only the owner's", async () => {
		const started = await challenges.start(maya, { kind: "shopping-pause" });
		expect(started.result.status).toBe("active");
		expect(started.result.days).toHaveLength(7);

		const shopping = (await createCategoryRepository(db).listFor(maya)).find(
			(c) => c.slug === "shopping",
		);
		// Sam's shopping must not count for Maya.
		await db.insert(transaction).values({
			userId: sam,
			categoryId: shopping?.id ?? "",
			merchant: "Uniqlo",
			amountMinor: 9_900,
			currency: "MYR",
			homeAmountMinor: 9_900,
			homeCurrency: "MYR",
			occurredAt: new Date(),
		});
		expect((await challenges.board(maya)).active[0]?.result.status).toBe(
			"active",
		);

		await db.insert(transaction).values({
			userId: maya,
			categoryId: shopping?.id ?? "",
			merchant: "Uniqlo",
			amountMinor: 9_900,
			currency: "MYR",
			homeAmountMinor: 9_900,
			homeCurrency: "MYR",
			occurredAt: new Date(),
		});
		const board = await challenges.board(maya);
		expect(board.active[0]?.result.status).toBe("lost");
		// Decided once: it isn't shown again after that.
		expect((await challenges.board(maya)).active).toEqual([]);
	});

	it("allows two at a time, not the same one twice, and giving up", async () => {
		const a = await challenges.start(maya, { kind: "log-daily" });
		await expect(challenges.start(maya, { kind: "log-daily" })).rejects.toThrow(
			/already running/,
		);
		await challenges.start(maya, { kind: "cook-at-home" });
		await expect(challenges.start(maya, { kind: "daily-cap" })).rejects.toThrow(
			/Two challenges/,
		);
		await expect(challenges.giveUp(sam, a.id)).rejects.toThrow();
		await challenges.giveUp(maya, a.id);
		expect((await challenges.board(maya)).active.map((c) => c.kind)).toEqual([
			"cook-at-home",
		]);
	});

	it("suggests caps a little under recent spending", async () => {
		const capped = await challenges.start(sam, { kind: "daily-cap" });
		expect(capped.targetMinor).toBeGreaterThan(0);
	});
});
