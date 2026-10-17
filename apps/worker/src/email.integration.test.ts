import { createDb, emailLog } from "@spendid/db";
import type { EmailJob } from "@spendid/emails";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { testDbUrl } from "../../api/test/db";
import { createEmailProcessor, type EmailQueueData } from "./email";

const url = testDbUrl();

const verify: EmailJob = {
	type: "verify-email",
	to: "maya@test.local",
	name: "Maya",
	url: "http://spendid.test/verify?token=x",
};

describe.skipIf(!url)("email worker (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	afterAll(() => database.close());

	async function queued(): Promise<string> {
		const [row] = await db
			.insert(emailLog)
			.values({ type: "verify-email" })
			.returning({ id: emailLog.id });
		return row?.id ?? "";
	}
	const jobFor = (logId: string, attemptsMade = 0) =>
		({
			data: { logId, job: verify },
			attemptsMade,
			opts: { attempts: 5 },
		}) as unknown as Job<EmailQueueData>;

	it("sends and marks the email sent", async () => {
		const sendMail = vi.fn(async (_mail: unknown) => ({}));
		const process = createEmailProcessor(
			db,
			{ host: "x", port: 1025, from: "Spendid <hi@spendid.test>" },
			{ transport: { sendMail } },
		);
		const logId = await queued();
		await process(jobFor(logId));
		expect(sendMail).toHaveBeenCalledTimes(1);
		const [row] = await db
			.select()
			.from(emailLog)
			.where(eq(emailLog.id, logId));
		expect(row?.status).toBe("sent");
	});

	it("never sends twice when a retry finds the email already sent", async () => {
		const sendMail = vi.fn(async (_mail: unknown) => ({}));
		const process = createEmailProcessor(
			db,
			{ host: "x", port: 1025, from: "Spendid <hi@spendid.test>" },
			{ transport: { sendMail } },
		);
		const logId = await queued();
		await db
			.update(emailLog)
			.set({ status: "sent", sentAt: new Date() })
			.where(eq(emailLog.id, logId));
		await process(jobFor(logId, 1));
		expect(sendMail).not.toHaveBeenCalled();
	});
});
