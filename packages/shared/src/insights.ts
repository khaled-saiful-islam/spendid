import type { Recurring } from "./recurring";

export interface RecurringItem extends Recurring {
	categoryName: string;
	icon: string;
	tint: string;
}

export interface RecurringOverview {
	currency: string;
	items: RecurringItem[];
	monthlyMinor: number;
	/** Still expected this month; already taken out of safe-to-spend. */
	billsDue: {
		minor: number;
		items: { merchant: string; day: string; amountMinor: number }[];
	};
}

export interface HeatDay {
	day: string;
	minor: number;
	count: number;
}

export interface Heatmap {
	month: string;
	currency: string;
	today: string;
	days: HeatDay[];
	maxMinor: number;
}

export interface WrappedCategory {
	name: string;
	icon: string;
	tint: string;
	minor: number;
	share: number;
}

export interface Personality {
	title: string;
	line: string;
	emoji: string;
}

export interface Wrapped {
	month: string;
	/** True while the month is still running ("so far"). */
	inProgress: boolean;
	currency: string;
	totalMinor: number;
	previousMinor: number;
	count: number;
	activeDays: number;
	noSpendDays: number;
	categories: WrappedCategory[];
	/** Every category spent in this month with its kind, biggest first (the money-flow chart). */
	flow: {
		name: string;
		kind: "need" | "want" | "saving";
		tint: string;
		minor: number;
	}[];
	biggestDay: { day: string; minor: number; count: number } | null;
	topMerchant: { name: string; visits: number; minor: number } | null;
	busiestWeekday: { weekday: number; minor: number } | null;
	kinds: { need: number; want: number; saving: number };
	savedMinor: number;
	subscriptionsMonthlyMinor: number;
	personality: Personality;
}

/** A light-hearted label for the month, from how the money was spent. */
export function moneyPersonality(input: {
	kinds: { need: number; want: number; saving: number };
	topCategorySlug: string | null;
	topShare: number;
	noSpendDays: number;
	daysInMonth: number;
}): Personality {
	const total = input.kinds.need + input.kinds.want + input.kinds.saving;
	const wantShare = total ? input.kinds.want / total : 0;
	const needShare = total ? input.kinds.need / total : 0;
	if (total === 0)
		return {
			title: "The Quiet Month",
			emoji: "🌙",
			line: "Barely a ringgit moved. Your wallet had a holiday.",
		};
	if (input.noSpendDays >= input.daysInMonth / 3)
		return {
			title: "The No-Spend Ninja",
			emoji: "🥷",
			line: `${input.noSpendDays} days without spending a thing. Impressive.`,
		};
	if (
		(input.topCategorySlug === "food" ||
			input.topCategorySlug === "eating-out") &&
		input.topShare >= 0.25
	)
		return {
			title: "The Foodie",
			emoji: "🍜",
			line: "Good food was the plan, and you stuck to it.",
		};
	if (
		input.topCategorySlug === "travel" ||
		(input.topCategorySlug === "fun" && wantShare >= 0.4)
	)
		return {
			title: "The Explorer",
			emoji: "🧭",
			line: "You spent on moments, not things.",
		};
	if (needShare >= 0.65)
		return {
			title: "The Steady Planner",
			emoji: "🗂️",
			line: "Mostly essentials. Future you says thanks.",
		};
	if (wantShare >= 0.45)
		return {
			title: "The Treat Maker",
			emoji: "🎁",
			line: "Plenty of treats this month. Make sure they were worth it.",
		};
	return {
		title: "The Balancer",
		emoji: "⚖️",
		line: "Needs and wants in good balance.",
	};
}
