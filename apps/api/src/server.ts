import { createDb } from "@spendid/db";
import {
	createAiGuard,
	createEventHub,
	createExpenseExtractor,
	createFileStore,
	createTranscriber,
} from "@spendid/server";
import { Queue } from "bullmq";
import { buildApp } from "./app";
import { createAuth, sessionLookup } from "./auth/auth";
import { loadEnv } from "./config/env";
import { createOutbox } from "./email/outbox";
import { createRedis } from "./infra/redis";
import { createAskAgent } from "./modules/ask/ask.agent";
import { createVoiceService } from "./modules/capture/voice.service";
import { createMeRepository } from "./modules/me/me.repository";
import { createCategoryRepository } from "./modules/money/categories.repository";
import { createFxRepository } from "./modules/money/fx.repository";
import { createPlanRepository } from "./modules/money/plan.repository";
import { createSummaryService } from "./modules/money/summary.service";
import { createTransactionRepository } from "./modules/money/transactions.repository";
import { createTransactionService } from "./modules/money/transactions.service";
import {
	createReceiptService,
	RECEIPT_QUEUE,
} from "./modules/receipts/receipts.service";

const env = loadEnv();
if (!env.RECEIPT_ENCRYPTION_KEY) {
	throw new Error(
		"RECEIPT_ENCRYPTION_KEY is missing. Run `make env` or set it in .env (openssl rand -base64 32).",
	);
}
const database = createDb(env.DATABASE_URL);
const cache = createRedis(env.REDIS_URL);
const outbox = createOutbox(database.db, cache.redis);
const auth = createAuth({
	env,
	db: database.db,
	redis: cache.redis,
	sendEmail: outbox.send,
});
const session = sessionLookup(auth);
const categories = createCategoryRepository(database.db);
const transactions = createTransactionRepository(database.db);
const fx = createFxRepository(database.db);
const summary = createSummaryService(database.db);
const plan = createPlanRepository(database.db);
const transactionService = createTransactionService({
	db: database.db,
	transactions,
	categories,
	fx,
});
const events = createEventHub(env.REDIS_URL);
const receiptQueue = new Queue<{ receiptId: string }>(RECEIPT_QUEUE, {
	connection: cache.redis,
});
const ilmu = { baseUrl: env.ILMU_BASE_URL, apiKey: env.ILMU_API_KEY };
const guard = createAiGuard({
	db: database.db,
	redis: cache.redis,
	defaultMonthlyTokens: env.AI_MONTHLY_TOKENS_DEFAULT,
	configured: env.ILMU_API_KEY.length > 0,
});

const app = await buildApp({
	checks: { database: database.ping, redis: cache.ping },
	version: process.env.npm_package_version ?? "0.0.0",
	auth,
	me: { session, repo: createMeRepository(database.db) },
	money: {
		session,
		categories,
		transactions,
		transactionService,
		summary,
		plan,
	},
	receipts: {
		session,
		events,
		receipts: createReceiptService({
			db: database.db,
			queue: receiptQueue,
			transactions: transactionService,
			store: createFileStore({
				root: env.RECEIPTS_DIR,
				keyBase64: env.RECEIPT_ENCRYPTION_KEY,
			}),
		}),
	},
	ask: {
		session,
		ask: createAskAgent({
			db: database.db,
			guard,
			categories,
			summary,
			plan,
			ilmu: { ...ilmu, model: env.ILMU_TEXT_MODEL },
		}),
	},
	capture: {
		session,
		guard,
		voice: createVoiceService({
			db: database.db,
			guard,
			categories,
			transcriber: createTranscriber({ ...ilmu, model: env.ILMU_ASR_MODEL }),
			extract: createExpenseExtractor({ ...ilmu, model: env.ILMU_TEXT_MODEL }),
			asrModel: env.ILMU_ASR_MODEL,
		}),
	},
	logger:
		env.NODE_ENV === "development"
			? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
			: { level: env.LOG_LEVEL },
});

async function shutdown(signal: string): Promise<void> {
	app.log.info({ signal }, "shutting down");
	await app.close();
	await Promise.allSettled([
		outbox.close(),
		receiptQueue.close(),
		events.close(),
		database.close(),
		cache.close(),
	]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: env.API_PORT });
