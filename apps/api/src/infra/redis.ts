import { type ErrorLog, logErrors } from "@spendid/server";
import { Redis } from "ioredis";

export function createRedis(url: string, logError: ErrorLog) {
	const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
	logErrors("redis", logError, redis);
	return {
		redis,
		ping: async (): Promise<boolean> => (await redis.ping()) === "PONG",
		close: async (): Promise<void> => {
			await redis.quit();
		},
	};
}
