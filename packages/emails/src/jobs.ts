import { z } from "zod";

/** Queue that carries every outgoing email. */
export const EMAIL_QUEUE = "email";

const base = {
	to: z.email(),
	name: z.string().min(1),
	userId: z.string().optional(),
	/** Set on optional emails: footer link + one-click List-Unsubscribe headers. */
	unsubscribeUrl: z.url().optional(),
};

/** Every alert and digest beyond the account basics. Sent through the notifier. */
export const NOTICE_KINDS = [
	"weekly-summary",
	"budget-alert",
	"unusual-charge",
	"duplicate-charge",
	"bill-due",
	"subscription-due",
	"subscriptions-month",
	"price-rise",
	"warranty-ending",
	"goal-reached",
	"money-wrapped",
	"new-sign-in",
	"passkey-added",
	"ai-limit",
	"announcement",
	"export-ready",
	"account-deleted",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** Each email the app can send, with exactly the data its template needs. */
export const EmailJobSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("verify-email"), ...base, url: z.url() }),
	z.object({ type: z.literal("reset-password"), ...base, url: z.url() }),
	z.object({
		type: z.literal("account-paused"),
		...base,
		reason: z.string().max(300).nullable(),
	}),
	z.object({ type: z.literal("account-restored"), ...base, url: z.url() }),
	z.object({
		type: z.literal("family-invite"),
		...base,
		inviterName: z.string().min(1).max(120),
		relation: z.string().min(1).max(40),
		url: z.url(),
	}),
	z.object({
		type: z.literal("family-joined"),
		...base,
		joinerName: z.string().min(1).max(120),
		url: z.url(),
	}),
	z.object({
		type: z.literal("family-share-changed"),
		...base,
		change: z.string().min(1).max(200),
		url: z.url(),
	}),
	z.object({
		type: z.literal("notice"),
		...base,
		kind: z.enum(NOTICE_KINDS),
		subject: z.string().min(1).max(140),
		preview: z.string().min(1).max(160),
		heading: z.string().min(1).max(120),
		body: z.string().min(1).max(2000),
		/** Small fact table, e.g. "Spent this week" → "RM 412.00". */
		rows: z
			.array(z.object({ label: z.string().max(60), value: z.string().max(80) }))
			.max(8)
			.default([]),
		action: z.string().min(1).max(40),
		url: z.url(),
		footnote: z.string().max(300).default(""),
	}),
]);

export type EmailJob = z.infer<typeof EmailJobSchema>;
export type EmailType = EmailJob["type"];
