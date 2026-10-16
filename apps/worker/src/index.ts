import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

/** Queue names shared with the API once jobs exist (receipts, email, recap…). */
export const QUEUES = { system: "system" } as const;

const env = z
	.object({ REDIS_URL: z.string().startsWith("redis") })
	.parse(process.env);
// BullMQ requires maxRetriesPerRequest: null for blocking worker connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const system = new Worker(
	QUEUES.system,
	async (job) => ({ handled: job.name, at: new Date().toISOString() }),
	{ connection },
);

system.on("ready", () =>
	process.stdout.write('[worker] ready — listening on queue "system"\n'),
);
system.on("failed", (job, err) =>
	process.stderr.write(
		`[worker] job ${job?.id ?? "?"} failed: ${err.message}\n`,
	),
);

async function shutdown(): Promise<void> {
	await system.close();
	await connection.quit();
	process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
