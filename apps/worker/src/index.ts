import { createDb } from "@spendid/db";
import { EMAIL_QUEUE } from "@spendid/emails";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { createEmailProcessor, type EmailQueueData } from "./email";

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
];

for (const w of workers) {
	w.on("ready", () =>
		process.stdout.write(`[worker] listening on "${w.name}"\n`),
	);
	w.on("completed", (job) =>
		process.stdout.write(`[worker] ${w.name}: ${job.name} sent\n`),
	);
	w.on("failed", (job, err) =>
		process.stderr.write(
			`[worker] ${w.name}: ${job?.name ?? "?"} failed (try ${job?.attemptsMade}): ${err.message}\n`,
		),
	);
}

async function shutdown(): Promise<void> {
	await Promise.allSettled(workers.map((w) => w.close()));
	await Promise.allSettled([connection.quit(), database.close()]);
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
