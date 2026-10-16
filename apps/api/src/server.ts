import { createDb } from "@spendid/db";
import { buildApp } from "./app";
import { createAuth, sessionLookup } from "./auth/auth";
import { loadEnv } from "./config/env";
import { createOutbox } from "./email/outbox";
import { createRedis } from "./infra/redis";
import { createMeRepository } from "./modules/me/me.repository";

const env = loadEnv();
const database = createDb(env.DATABASE_URL);
const cache = createRedis(env.REDIS_URL);
const outbox = createOutbox(database.db, cache.redis);
const auth = createAuth({
	env,
	db: database.db,
	redis: cache.redis,
	sendEmail: outbox.send,
});

const app = await buildApp({
	checks: { database: database.ping, redis: cache.ping },
	version: process.env.npm_package_version ?? "0.0.0",
	auth,
	me: { session: sessionLookup(auth), repo: createMeRepository(database.db) },
	logger:
		env.NODE_ENV === "development"
			? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
			: { level: env.LOG_LEVEL },
});

async function shutdown(signal: string): Promise<void> {
	app.log.info({ signal }, "shutting down");
	await app.close();
	await Promise.allSettled([outbox.close(), database.close(), cache.close()]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: env.API_PORT });
