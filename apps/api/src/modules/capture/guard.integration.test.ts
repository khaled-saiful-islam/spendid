import { aiLimit, createDb } from "@spendid/db";
import { createAiGuard } from "@spendid/server";
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
	},
);
