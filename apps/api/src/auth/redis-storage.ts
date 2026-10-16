import type { SecondaryStorage } from "better-auth";
import type { Redis } from "ioredis";

const PREFIX = "auth:";

/** Better Auth secondary storage on Redis: session cache + rate-limit counters. */
export function redisStorage(redis: Redis): SecondaryStorage {
	return {
		get: (key) => redis.get(PREFIX + key),
		set: async (key, value, ttl) => {
			if (ttl) await redis.set(PREFIX + key, value, "EX", ttl);
			else await redis.set(PREFIX + key, value);
		},
		delete: async (key) => {
			await redis.del(PREFIX + key);
		},
		getAndDelete: (key) => redis.getdel(PREFIX + key),
		// TTL applies only when the counter is created (Better Auth's contract).
		increment: async (key, ttl) => {
			const [[, count]] = (await redis
				.multi()
				.incr(PREFIX + key)
				.expire(PREFIX + key, ttl, "NX")
				.exec()) as [[Error | null, number]];
			return count;
		},
	};
}
