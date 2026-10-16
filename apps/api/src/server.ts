import { buildApp } from "./app";
import { loadEnv } from "./config/env";
import { createDatabase } from "./infra/db";
import { createRedis } from "./infra/redis";

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const cache = createRedis(env.REDIS_URL);

const app = await buildApp({
	checks: { database: database.ping, redis: cache.ping },
	version: process.env.npm_package_version ?? "0.0.0",
	logger:
		env.NODE_ENV === "development"
			? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
			: { level: env.LOG_LEVEL },
});

async function shutdown(signal: string): Promise<void> {
	app.log.info({ signal }, "shutting down");
	await app.close();
	await Promise.allSettled([database.close(), cache.close()]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: env.API_PORT });
