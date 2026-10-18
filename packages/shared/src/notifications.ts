import { z } from "zod";

/** Optional email groups people can switch off. Account and security emails always go out. */
export const EMAIL_GROUPS = [
	"weekly",
	"budget",
	"unusual",
	"bills",
	"warranty",
	"goals",
	"wrapped",
	"family",
	"product",
] as const;
export type EmailGroup = (typeof EMAIL_GROUPS)[number];

export const EMAIL_GROUP_INFO: Record<
	EmailGroup,
	{ label: string; about: string }
> = {
	weekly: {
		label: "Weekly summary",
		about: "Monday morning: last week's spending and how the month looks.",
	},
	budget: {
		label: "Budget alerts",
		about: "When a category reaches 80% and 100% of its monthly limit.",
	},
	unusual: {
		label: "Unusual or double charges",
		about: "A charge much bigger than usual, or the same one twice.",
	},
	bills: {
		label: "Bills and price rises",
		about: "A bill due in the next few days, or a subscription that went up.",
	},
	warranty: {
		label: "Warranty reminders",
		about: "Before a warranty from your receipts runs out.",
	},
	goals: {
		label: "Goals reached",
		about: "When a savings goal or shared jar is full.",
	},
	wrapped: {
		label: "Money Wrapped",
		about: "Your month in review, on the 1st.",
	},
	family: {
		label: "Family circle",
		about:
			"Someone joined, changed what they share, added to a shared jar or cheered you on.",
	},
	product: {
		label: "Spendid news",
		about: "Occasional updates from the Spendid team. Never your data.",
	},
};

export const NotificationPrefsSchema = z.object({
	weekly: z.boolean(),
	budget: z.boolean(),
	unusual: z.boolean(),
	bills: z.boolean(),
	warranty: z.boolean(),
	goals: z.boolean(),
	wrapped: z.boolean(),
	family: z.boolean(),
	product: z.boolean(),
	hideAmounts: z.boolean(),
	/** 8 pm: a nudge to log today's spending. Phone and the bell only, never email. */
	eveningNudge: z.boolean(),
	quietStart: z.number().int().min(0).max(23),
	quietEnd: z.number().int().min(0).max(23),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

export const DEFAULT_PREFS: NotificationPrefs = {
	weekly: true,
	budget: true,
	unusual: true,
	bills: true,
	warranty: true,
	goals: true,
	wrapped: true,
	family: true,
	product: true,
	hideAmounts: false,
	eveningNudge: false,
	quietStart: 22,
	quietEnd: 8,
};

/**
 * Milliseconds to wait so an email lands after quiet hours, given the local hour and minute.
 * Quiet time wraps midnight when start > end (22 → 8). Equal hours mean no quiet time.
 */
export function quietDelayMs(
	local: { hour: number; minute: number },
	quietStart: number,
	quietEnd: number,
): number {
	if (quietStart === quietEnd) return 0;
	const { hour, minute } = local;
	const inQuiet =
		quietStart < quietEnd
			? hour >= quietStart && hour < quietEnd
			: hour >= quietStart || hour < quietEnd;
	if (!inQuiet) return 0;
	const hoursLeft = (quietEnd - hour + 24) % 24;
	return (hoursLeft * 60 - minute) * 60_000;
}
