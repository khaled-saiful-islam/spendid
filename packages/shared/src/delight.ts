import { z } from "zod";

/** Impulse pause: wait this long before deciding. */
export const WISH_COOLDOWN_HOURS = 48;
/** A working month, for "hours of work" (40 h × 52 weeks ÷ 12). */
export const WORK_HOURS_PER_MONTH = (40 * 52) / 12;

/** How many hours of work something costs, from monthly income. Null without income. */
export function hoursOfWork(
	priceMinor: number,
	monthlyIncomeMinor: number | null,
): number | null {
	if (!monthlyIncomeMinor || monthlyIncomeMinor <= 0) return null;
	return (
		Math.round(
			(priceMinor / (monthlyIncomeMinor / WORK_HOURS_PER_MONTH)) * 10,
		) / 10
	);
}

export const WishInputSchema = z.object({
	name: z.string().trim().min(1, "What do you want to buy?").max(80),
	priceMinor: z.number().int().positive("Add the price").max(1_000_000_000),
	currency: z.string().length(3),
	link: z.url("That link doesn't look right").max(500).nullable().optional(),
});
export type WishInput = z.infer<typeof WishInputSchema>;

export const WishDecisionSchema = z.object({
	decision: z.enum(["bought", "skipped"]),
});

export interface Wish {
	id: string;
	name: string;
	priceMinor: number;
	currency: string;
	link: string | null;
	createdAt: string;
	coolUntil: string;
	decision: "bought" | "skipped" | null;
	decidedAt: string | null;
	hoursOfWork: number | null;
}

export interface WishList {
	waiting: Wish[];
	decided: Wish[];
	/** Skipped wishes in the home currency: money not spent thanks to waiting. */
	savedMinor: number;
	currency: string;
}
