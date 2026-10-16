import { z } from "zod";

/** Queue that carries every outgoing email. */
export const EMAIL_QUEUE = "email";

const base = { to: z.email(), name: z.string().min(1), userId: z.string().optional() };

/** Each email the app can send, with exactly the data its template needs. */
export const EmailJobSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("verify-email"), ...base, url: z.url() }),
	z.object({ type: z.literal("reset-password"), ...base, url: z.url() }),
	z.object({ type: z.literal("account-paused"), ...base, reason: z.string().max(300).nullable() }),
	z.object({ type: z.literal("account-restored"), ...base, url: z.url() }),
	z.object({
		type: z.literal("family-invite"),
		...base,
		inviterName: z.string().min(1).max(120),
		relation: z.string().min(1).max(40),
		url: z.url(),
	}),
	z.object({ type: z.literal("family-joined"), ...base, joinerName: z.string().min(1).max(120), url: z.url() }),
	z.object({ type: z.literal("family-share-changed"), ...base, change: z.string().min(1).max(200), url: z.url() }),
]);

export type EmailJob = z.infer<typeof EmailJobSchema>;
export type EmailType = EmailJob["type"];
