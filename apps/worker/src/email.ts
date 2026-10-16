import { type Db, emailLog } from "@spendid/db";
import { type EmailJob, EmailJobSchema, renderEmail } from "@spendid/emails";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createTransport } from "nodemailer";

export interface EmailQueueData {
	logId: string;
	job: EmailJob;
}

interface MailConfig {
	host: string;
	port: number;
	from: string;
}

/** Renders and sends one email; marks the log row sent, or failed after the last retry. */
export function createEmailProcessor(db: Db, mail: MailConfig) {
	const transport = createTransport({
		host: mail.host,
		port: mail.port,
		secure: mail.port === 465,
	});

	return async (job: Job<EmailQueueData>): Promise<void> => {
		const data = EmailJobSchema.parse(job.data.job);
		try {
			const email = await renderEmail(data);
			await transport.sendMail({ from: mail.from, to: data.to, ...email });
			await db
				.update(emailLog)
				.set({ status: "sent", sentAt: new Date(), error: null })
				.where(eq(emailLog.id, job.data.logId));
		} catch (error) {
			const lastTry = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
			if (lastTry) {
				const message =
					error instanceof Error ? error.message : "unknown error";
				await db
					.update(emailLog)
					.set({ status: "failed", error: message.slice(0, 500) })
					.where(eq(emailLog.id, job.data.logId));
			}
			throw error;
		}
	};
}
