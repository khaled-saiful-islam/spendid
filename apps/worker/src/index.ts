import { writeFile } from "node:fs/promises";
import { createDb } from "@spendid/db";
import { EMAIL_QUEUE } from "@spendid/emails";
import {
	createAiGuard,
	createAppSettings,
	createEmbedder,
	createFileStore,
	createMerchantMatcher,
	createMerchantMemory,
	createPublisher,
	createReceiptReader,
	guardProcess,
	logErrors,
	MERCHANT_QUEUE,
	NOTIFY_QUEUE,
	type NotifyJob,
	stderrLog,
} from "@spendid/server";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { createEmailProcessor, type EmailQueueData } from "./email";
import { FX_QUEUE, refreshRates } from "./fx";
import { backfillMerchants, type MerchantJob } from "./merchants";
import { createReceiptProcessor, RECEIPT_QUEUE } from "./receipts";

const env = z
	.object({
		REDIS_URL: z.string().startsWith("redis"),
		DATABASE_URL: z.string().startsWith("postgres"),
		SMTP_HOST: z.string().min(1),
		SMTP_PORT: z.coerce.number().int().positive(),
		SMTP_USER: z.string().optional(),
		SMTP_PASS: z.string().optional(),
		MAIL_FROM: z.string().min(3),
		ILMU_BASE_URL: z.url().default("https://api.ilmu.ai/v1"),
		ILMU_API_KEY: z.string().default(""),
		ILMU_VISION_MODEL: z.string().min(1).default("ilmu-vision-v1.3"),
		ILMU_EMBED_MODEL: z.string().min(1).default("bge-m3"),
		AI_MONTHLY_TOKENS_DEFAULT: z.coerce.number().int().min(0).default(200_000),
		RECEIPTS_DIR: z.string().min(1).default("/data/receipts"),
		RECEIPT_ENCRYPTION_KEY: z
			.string()
			.min(40, "RECEIPT_ENCRYPTION_KEY is missing (openssl rand -base64 32)"),
	})
	.parse(process.env);

const logError = stderrLog("worker");
guardProcess(logError);

// BullMQ requires maxRetriesPerRequest: null for blocking worker connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const database = createDb(env.DATABASE_URL, 4);
// A separate plain connection for publishing (blocking worker connections can't PUBLISH reliably).
const publisher = new Redis(env.REDIS_URL);
// The API owns emails about people; the worker only hands it events.
const notifyQueue = new Queue<NotifyJob>(NOTIFY_QUEUE, { connection });
logErrors("redis", logError, connection, publisher);
const guard = createAiGuard({
	settings: createAppSettings({
		db: database.db,
		redis: publisher,
		defaults: {
			aiEnabled: true,
			defaultMonthlyTokens: env.AI_MONTHLY_TOKENS_DEFAULT,
		},
	}),
	db: database.db,
	redis: publisher,
	defaultMonthlyTokens: env.AI_MONTHLY_TOKENS_DEFAULT,
	configured: env.ILMU_API_KEY.length > 0,
	onLimitReached: (userId) =>
		notifyQueue.add(
			"ai-limit",
			{ kind: "ai-limit", userId },
			{ removeOnComplete: 200, attempts: 3 },
		),
});

const merchants = createMerchantMemory(database.db);
const merchantQueue = new Queue<MerchantJob>(MERCHANT_QUEUE, { connection });
const matchMerchant = createMerchantMatcher({
	db: database.db,
	guard,
	embed: createEmbedder({
		baseUrl: env.ILMU_BASE_URL,
		apiKey: env.ILMU_API_KEY,
		model: env.ILMU_EMBED_MODEL,
	}),
});

const workers = [
	new Worker<EmailQueueData>(
		EMAIL_QUEUE,
		createEmailProcessor(database.db, {
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			from: env.MAIL_FROM,
			user: env.SMTP_USER || undefined,
			pass: env.SMTP_PASS,
		}),
		{ connection, concurrency: 5 },
	),
	new Worker(
		FX_QUEUE,
		async () => ({ stored: await refreshRates(database.db) }),
		{
			connection,
			concurrency: 1,
		},
	),
	new Worker(
		RECEIPT_QUEUE,
		createReceiptProcessor({
			db: database.db,
			guard,
			store: createFileStore({
				root: env.RECEIPTS_DIR,
				keyBase64: env.RECEIPT_ENCRYPTION_KEY,
			}),
			read: createReceiptReader({
				baseUrl: env.ILMU_BASE_URL,
				apiKey: env.ILMU_API_KEY,
				model: env.ILMU_VISION_MODEL,
			}),
			publish: createPublisher(publisher),
			merchants,
		}),
		{ connection, concurrency: 3 },
	),
	new Worker<MerchantJob>(
		MERCHANT_QUEUE,
		async (job) => ({ result: await matchMerchant(job.data.merchantId) }),
		{ connection, concurrency: 2 },
	),
];

for (const w of workers) {
	w.on("ready", () =>
		process.stdout.write(`[worker] listening on "${w.name}"\n`),
	);
	w.on("completed", (job) =>
		process.stdout.write(`[worker] ${w.name}: ${job.name} done\n`),
	);
	w.on("failed", (job, err) =>
		process.stderr.write(
			`[worker] ${w.name}: ${job?.name ?? "?"} failed (try ${job?.attemptsMade}): ${err.message}\n`,
		),
	);
}

// People who logged spending before shops were remembered: learn from their history once.
void backfillMerchants(database.db, merchants, merchantQueue)
	.then((n) => n && process.stdout.write(`[worker] remembered ${n} shops\n`))
	.catch((err: unknown) =>
		process.stderr.write(`[worker] shop backfill failed: ${String(err)}\n`),
	);

// Exchange rates: once at startup, then every 6 hours (ECB publishes once per working day).
const fxQueue = new Queue(FX_QUEUE, { connection });
logErrors("queues", logError, notifyQueue, merchantQueue, fxQueue, ...workers);
await fxQueue.upsertJobScheduler(
	"fx-refresh",
	{ every: 6 * 60 * 60 * 1000, immediately: true },
	{
		name: "refresh",
		opts: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
	},
);

// Health: touch a file while Redis answers; the production healthcheck reads its age.
const ALIVE_FILE = "/tmp/worker-alive";
const heartbeat = setInterval(() => {
	connection
		.ping()
		.then(() => writeFile(ALIVE_FILE, String(Date.now())))
		.catch((err: unknown) => logError("health heartbeat failed", err));
}, 30_000);
heartbeat.unref();
void writeFile(ALIVE_FILE, String(Date.now())).catch((err: unknown) =>
	logError("health heartbeat failed", err),
);

/** Under Docker's 10-second stop window. A job cut short is retried by the next worker. */
const SHUTDOWN_GRACE_MS = 8_000;

async function shutdown(): Promise<void> {
	setTimeout(() => {
		process.stderr.write("[worker] shutdown took too long; exiting\n");
		process.exit(1);
	}, SHUTDOWN_GRACE_MS).unref();
	await Promise.allSettled([
		...workers.map((w) => w.close()),
		fxQueue.close(),
		merchantQueue.close(),
		notifyQueue.close(),
	]);
	await Promise.allSettled([
		connection.quit(),
		publisher.quit(),
		database.close(),
	]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
