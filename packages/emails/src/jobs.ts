import { z } from "zod";

/** Queue that carries every outgoing email. */
export const EMAIL_QUEUE = "email";

const base = { to: z.email(), name: z.string().min(1), userId: z.string().optional() };

/** Each email the app can send, with exactly the data its template needs. */
export const EmailJobSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("verify-email"), ...base, url: z.url() }),
	z.object({ type: z.literal("reset-password"), ...base, url: z.url() }),
]);

export type EmailJob = z.infer<typeof EmailJobSchema>;
export type EmailType = EmailJob["type"];
