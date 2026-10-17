import { type Db, emailLog } from "@spendid/db";
import { EMAIL_QUEUE, type EmailJob, EmailJobSchema } from "@spendid/emails";
import { type ErrorLog, logErrors } from "@spendid/server";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export interface EmailQueueData {
	logId: string;
	job: EmailJob;
}

export type SendEmail = (
	job: EmailJob,
	opts?: { delayMs?: number },
) => Promise<void>;

/**
 * Records the email as queued (type + status only) and hands it to the worker.
 * Retries with backoff live in the worker, so a mail outage never blocks a request.
 */
export function createOutbox(db: Db, redis: Redis, logError: ErrorLog) {
	const queue = new Queue<EmailQueueData>(EMAIL_QUEUE, { connection: redis });
	logErrors("email queue", logError, queue);

	const send: SendEmail = async (input, opts = {}) => {
		const job = EmailJobSchema.parse(input);
		// Notices log their kind ("budget-alert"), so delivery stats stay meaningful.
		const type = job.type === "notice" ? job.kind : job.type;
		const [row] = await db
			.insert(emailLog)
			.values({ type, userId: job.userId ?? null })
			.returning({ id: emailLog.id });
		if (!row) throw new Error("could not record email");
		await queue.add(
			job.type,
			{ logId: row.id, job },
			{
				delay: Math.max(0, opts.delayMs ?? 0),
				attempts: 5,
				backoff: { type: "exponential", delay: 5_000 },
				removeOnComplete: 1_000,
				removeOnFail: 5_000,
			},
		);
	};

	return { send, close: () => queue.close() };
}
