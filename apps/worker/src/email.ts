import { type Db, emailLog } from "@spendid/db";
import { type EmailJob, EmailJobSchema, renderEmail } from "@spendid/emails";
import { type ErrorLog, stderrLog } from "@spendid/server";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createTransport, type SendMailOptions } from "nodemailer";

export interface EmailQueueData {
	logId: string;
	job: EmailJob;
}

interface MailConfig {
	host: string;
	port: number;
	from: string;
	/** Login for a real mail provider; Mailpit in dev needs none. */
	user?: string;
	pass?: string;
}

/** Renders and sends one email; marks the log row sent, or failed after the last retry. */
export function createEmailProcessor(
	db: Db,
	mail: MailConfig,
	{
		transport = createTransport({
			host: mail.host,
			port: mail.port,
			// 465 is TLS from the start; 587 upgrades with STARTTLS when the server offers it.
			secure: mail.port === 465,
			auth: mail.user ? { user: mail.user, pass: mail.pass ?? "" } : undefined,
		}),
		logError = stderrLog("worker"),
	}: {
		transport?: { sendMail(mail: SendMailOptions): Promise<unknown> };
		logError?: ErrorLog;
	} = {},
) {
	return async (job: Job<EmailQueueData>): Promise<void> => {
		const data = EmailJobSchema.parse(job.data.job);
		const [log] = await db
			.select({ status: emailLog.status })
			.from(emailLog)
			.where(eq(emailLog.id, job.data.logId))
			.limit(1);
		// A retry of an email that already went out: never send it twice.
		if (log?.status === "sent") return;
		try {
			const email = await renderEmail(data);
			// Optional emails get one-click unsubscribe (RFC 8058) for mail apps' own button.
			const oneClick = data.unsubscribeUrl?.replace(
				"/unsubscribe?",
				"/api/email/unsubscribe?",
			);
			await transport.sendMail({
				from: mail.from,
				to: data.to,
				...email,
				...(oneClick && {
					headers: {
						"List-Unsubscribe": `<${oneClick}>`,
						"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
					},
				}),
			});
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
		// Sent. If noting that fails, log it rather than throw: a retry would send it again.
		await db
			.update(emailLog)
			.set({ status: "sent", sentAt: new Date(), error: null })
			.where(eq(emailLog.id, job.data.logId))
			.catch((err: unknown) =>
				logError("email sent, but marking it sent failed", err),
			);
	};
}
