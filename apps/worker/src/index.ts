import { createDb } from "@spendid/db";
import { EMAIL_QUEUE } from "@spendid/emails";
import {
	createAiGuard,
	createFileStore,
	createPublisher,
	createReceiptReader,
} from "@spendid/server";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { createEmailProcessor, type EmailQueueData } from "./email";
import { FX_QUEUE, refreshRates } from "./fx";
import { createReceiptProcessor, RECEIPT_QUEUE } from "./receipts";

const env = z
	.object({
		REDIS_URL: z.string().startsWith("redis"),
		DATABASE_URL: z.string().startsWith("postgres"),
		SMTP_HOST: z.string().min(1),
		SMTP_PORT: z.coerce.number().int().positive(),
		MAIL_FROM: z.string().min(3),
		ILMU_BASE_URL: z.url().default("https://api.ilmu.ai/v1"),
		ILMU_API_KEY: z.string().default(""),
		ILMU_VISION_MODEL: z.string().min(1).default("ilmu-vision-v1.3"),
		AI_MONTHLY_TOKENS_DEFAULT: z.coerce.number().int().min(0).default(200_000),
		RECEIPTS_DIR: z.string().min(1).default("/data/receipts"),
		RECEIPT_ENCRYPTION_KEY: z
			.string()
			.min(40, "RECEIPT_ENCRYPTION_KEY is missing (openssl rand -base64 32)"),
	})
	.parse(process.env);

// BullMQ requires maxRetriesPerRequest: null for blocking worker connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const database = createDb(env.DATABASE_URL, 4);
// A separate plain connection for publishing (blocking worker connections can't PUBLISH reliably).
const publisher = new Redis(env.REDIS_URL);
const guard = createAiGuard({
	db: database.db,
	redis: publisher,
	defaultMonthlyTokens: env.AI_MONTHLY_TOKENS_DEFAULT,
	configured: env.ILMU_API_KEY.length > 0,
});

const workers = [
	new Worker<EmailQueueData>(
		EMAIL_QUEUE,
		createEmailProcessor(database.db, {
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			from: env.MAIL_FROM,
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
		}),
		{ connection, concurrency: 3 },
	),
];

// Exchange rates: once at startup, then every 6 hours (ECB publishes once per working day).
const fxQueue = new Queue(FX_QUEUE, { connection });
await fxQueue.upsertJobScheduler(
	"fx-refresh",
	{ every: 6 * 60 * 60 * 1000, immediately: true },
	{
		name: "refresh",
		opts: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
	},
);

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

async function shutdown(): Promise<void> {
	await Promise.allSettled([...workers.map((w) => w.close()), fxQueue.close()]);
	await Promise.allSettled([
		connection.quit(),
		publisher.quit(),
		database.close(),
	]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
