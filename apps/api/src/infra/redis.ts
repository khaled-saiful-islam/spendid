import { Redis } from "ioredis";

export function createRedis(url: string) {
	const redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
	return {
		redis,
		ping: async (): Promise<boolean> => (await redis.ping()) === "PONG",
		close: async (): Promise<void> => {
			await redis.quit();
		},
	};
}
