import { createDb } from "@spendid/db";
import { EMAIL_QUEUE } from "@spendid/emails";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { createEmailProcessor, type EmailQueueData } from "./email";
import { FX_QUEUE, refreshRates } from "./fx";

const env = z
	.object({
		REDIS_URL: z.string().startsWith("redis"),
		DATABASE_URL: z.string().startsWith("postgres"),
		SMTP_HOST: z.string().min(1),
		SMTP_PORT: z.coerce.number().int().positive(),
		MAIL_FROM: z.string().min(3),
	})
	.parse(process.env);

// BullMQ requires maxRetriesPerRequest: null for blocking worker connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const database = createDb(env.DATABASE_URL, 4);

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
	await Promise.allSettled([connection.quit(), database.close()]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
