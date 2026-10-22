import { aiLimit, aiUsage, createDb } from "@spendid/db";
import { allowanceMonth, createAiGuard } from "@spendid/server";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";

const url = testDbUrl();
const redisUrl = process.env.REDIS_URL;

describe.skipIf(!url || !redisUrl)(
	"AI allowance guard (real database and Redis)",
	() => {
		const database = createDb(url ?? "postgres://unused", 4);
		const redis = new Redis(redisUrl ?? "redis://unused");
		const guard = createAiGuard({
			db: database.db,
			redis,
			defaultMonthlyTokens: 10_000,
			configured: true,
		});
		afterAll(async () => {
			await redis.quit();
			await database.close();
		});

		it("lets only as many calls through as the allowance has room for, even when they arrive together", async () => {
			const maya = await createPerson(database.db);
			// Room for about one call.
			await database.db
				.insert(aiLimit)
				.values({ userId: maya, monthlyTokens: 3_000, enabled: true });
			const tries = await Promise.allSettled(
				Array.from({ length: 8 }, () => guard.assertAllowed(maya)),
			);
			const allowed = tries.filter((t) => t.status === "fulfilled").length;
			expect(allowed).toBeGreaterThanOrEqual(1);
			expect(allowed).toBeLessThanOrEqual(2);
		});

		it("frees the room once the call is recorded", async () => {
			const sam = await createPerson(database.db);
			await database.db
				.insert(aiLimit)
				.values({ userId: sam, monthlyTokens: 3_000, enabled: true });
			await guard.assertAllowed(sam);
			await guard.record(sam, {
				feature: "test",
				model: "m",
				inputTokens: 100,
				outputTokens: 0,
			});
			await expect(guard.assertAllowed(sam)).resolves.toBeUndefined();
		});

		it("always gives the per-minute counter an expiry, so nobody is blocked for good", async () => {
			const zoe = await createPerson(database.db);
			// A counter left without an expiry (say, the process died between the two calls).
			await redis.set(`ai:burst:${zoe}`, "5");
			await guard.assertAllowed(zoe);
			expect(await redis.ttl(`ai:burst:${zoe}`)).toBeGreaterThan(0);
		});

		it("renews every month by itself: last month's use doesn't count", async () => {
			const lee = await createPerson(database.db);
			await database.db
				.insert(aiLimit)
				.values({ userId: lee, monthlyTokens: 5_000, enabled: true });
			const { start, resetsOn } = allowanceMonth();
			// Far over the limit, but one minute before this month began (Malaysia time).
			await database.db.insert(aiUsage).values({
				userId: lee,
				feature: "ask",
				model: "m",
				billedTokens: 50_000,
				createdAt: new Date(start.getTime() - 60_000),
			});
			await expect(guard.assertAllowed(lee)).resolves.toBeUndefined();
			const usage = await guard.usage(lee);
			expect(usage.usedTokens).toBe(0);
			expect(usage.limitTokens).toBe(5_000);
			expect(usage.resetsOn).toBe(resetsOn);

			// This month's use does count.
			await database.db.insert(aiUsage).values({
				userId: lee,
				feature: "ask",
				model: "m",
				billedTokens: 6_000,
				createdAt: new Date(start.getTime() + 60_000),
			});
			await redis.del(`ai:month:${lee}:${allowanceMonth().key}`);
			await expect(guard.assertAllowed(lee)).rejects.toThrow(/allowance/i);
		});

		it("stays off when the admin switched AI off, whatever the month", async () => {
			const kim = await createPerson(database.db);
			await database.db
				.insert(aiLimit)
				.values({ userId: kim, monthlyTokens: 5_000, enabled: false });
			await expect(guard.assertAllowed(kim)).rejects.toThrow();
			expect((await guard.status(kim)).enabled).toBe(false);
		});
	},
);
