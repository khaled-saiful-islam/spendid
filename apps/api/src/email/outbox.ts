import { type Db, emailLog } from "@spendid/db";
import { EMAIL_QUEUE, type EmailJob, EmailJobSchema } from "@spendid/emails";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export interface EmailQueueData {
	logId: string;
	job: EmailJob;
}

export type SendEmail = (job: EmailJob) => Promise<void>;

/**
 * Records the email as queued (type + status only) and hands it to the worker.
 * Retries with backoff live in the worker, so a mail outage never blocks a request.
 */
export function createOutbox(db: Db, redis: Redis) {
	const queue = new Queue<EmailQueueData>(EMAIL_QUEUE, { connection: redis });

	const send: SendEmail = async (input) => {
		const job = EmailJobSchema.parse(input);
		const [row] = await db
			.insert(emailLog)
			.values({ type: job.type, userId: job.userId ?? null })
			.returning({ id: emailLog.id });
		if (!row) throw new Error("could not record email");
		await queue.add(
			job.type,
			{ logId: row.id, job },
			{
				attempts: 5,
				backoff: { type: "exponential", delay: 5_000 },
				removeOnComplete: 1_000,
				removeOnFail: 5_000,
			},
		);
	};

	return { send, close: () => queue.close() };
}
