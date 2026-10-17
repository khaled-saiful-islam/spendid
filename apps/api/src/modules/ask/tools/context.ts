import type { Db } from "@spendid/db";
import {
	type AskAction,
	type Category,
	type ChartSpec,
	formatMinor,
	minorDigits,
	type ReceiptDraft,
	SYSTEM_CATEGORIES,
	type VoiceDraft,
} from "@spendid/shared";
import { z } from "zod";
import type { Notifier } from "../../../notify/notifier";
import type { ChallengeService } from "../../delight/challenges.service";
import type { FamilyService } from "../../family/family.service";
import type { JarsService } from "../../family/jars.service";
import type { PlanRepository } from "../../money/plan.repository";
import type { SummaryService } from "../../money/summary.service";
import type { SubscriptionService } from "../../subscriptions/subscriptions.service";

export const SLUGS = SYSTEM_CATEGORIES.map((c) => c.slug) as [
	string,
	...string[],
];
export const DateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Everything a tool may know about the person — set by the server, never by the model. */
export interface AskContext {
	userId: string;
	timeZone: string;
	homeCurrency: string;
	categories: Category[];
	/** The person's name and language (for split cards and plan changes). */
	name?: string;
	locale?: "en" | "ms";
	/** A receipt the person attached to this question, already read. */
	receipt?: { id: string; draft: ReceiptDraft } | null;
}

/** Where tools put what the app should render beside the answer. */
export interface SideChannel {
	charts: ChartSpec[];
	drafts: VoiceDraft[];
	actions: AskAction[];
}

export const MAX_ACTIONS = 4;

/** Plain words the model picks from (models garble emoji in tool arguments). */
export const GOAL_ICONS: Record<string, string> = {
	travel: "✈️",
	beach: "🏝️",
	laptop: "💻",
	phone: "📱",
	car: "🚗",
	motorbike: "🛵",
	house: "🏠",
	wedding: "💍",
	baby: "👶",
	education: "🎓",
	emergency: "☂️",
	health: "🩺",
	gift: "🎁",
	game: "🎮",
	camera: "📷",
	pet: "🐾",
	festive: "🌙",
	other: "🎯",
};
export const GOAL_ICON_WORDS = Object.keys(GOAL_ICONS) as [string, ...string[]];

/** Last day of a month as YYYY-MM-DD. */
export function endOfMonth(year: number, month: number): string {
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
export const NOT_SAVED =
	"Shown to the person as a card to confirm. It is NOT created until they tap the button. Say so briefly; never claim it's done.";

/** Loose name match for "add 100 to bali": exact, then starts-with, then contains (case-insensitive). */
export function matchByName<T extends { name: string }>(
	items: T[],
	query: string,
): T | null {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	return (
		items.find((i) => i.name.toLowerCase() === q) ??
		items.find((i) => i.name.toLowerCase().startsWith(q)) ??
		items.find((i) => i.name.toLowerCase().includes(q)) ??
		items.find((i) => q.includes(i.name.toLowerCase())) ??
		null
	);
}

export interface ToolDeps {
	db: Db;
	summary: SummaryService;
	plan: PlanRepository;
	/** Optional services; an area's tools are left out when its service isn't given. */
	subscriptions?: Pick<SubscriptionService, "overview">;
	challenges?: Pick<ChallengeService, "board">;
	family?: Pick<FamilyService, "overview">;
	jars?: Pick<JarsService, "overview">;
	notifier?: Pick<Notifier, "prefs">;
}

export const shown = (minor: number, currency: string) =>
	formatMinor(minor, currency);
export const major = (minor: number, currency: string) =>
	Number((minor / 10 ** minorDigits(currency)).toFixed(minorDigits(currency)));
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The listed word a model meant, forgiving small slips ("laptopp", "Food "): exact, then one
 * being the start of the other. Null when nothing is close.
 */
export function closestWord(
	value: string | null | undefined,
	words: readonly string[],
): string | null {
	const v = (value ?? "").trim().toLowerCase();
	if (!v) return null;
	return (
		words.find((w) => w === v) ??
		words.find((w) => v.startsWith(w) || (v.length >= 3 && w.startsWith(v))) ??
		null
	);
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const CYCLE_WORDS = [
	"weekly",
	"monthly",
	"quarterly",
	"yearly",
] as const;

/** Today in the person's time zone, YYYY-MM-DD. */
export function localToday(timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** The next date with this day of the month, today included (31st → last day in short months). */
export function nextDayOfMonth(today: string, day: number): string {
	const [y, m, d] = today.split("-").map(Number) as [number, number, number];
	const pick = (yy: number, mm: number) => {
		const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
		return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
	};
	const thisMonth = pick(y, m);
	if (Number(thisMonth.slice(8)) >= d) return thisMonth;
	return m === 12 ? pick(y + 1, 1) : pick(y, m + 1);
}

/** A category word the model may garble; described with every allowed slug. */
export const CategoryWord = z.string().describe(`One of: ${SLUGS.join(", ")}`);
export const unknownCategory = () =>
	`Unknown category. Use one of: ${SLUGS.join(", ")}.`;

/** Adds a card for the person to confirm; a message for the model when there are enough already. */
export function offerTo(side: SideChannel) {
	return (action: AskAction): string | null => {
		if (side.actions.length >= MAX_ACTIONS)
			return "Enough cards are shown already; ask the person to confirm those first.";
		side.actions.push(action);
		return null;
	};
}

/** Picks one of the listed words; ILMU sometimes garbles enum values. */
export const WordSchema = (words: readonly string[]) =>
	z.string().describe(`One of: ${words.join(", ")}`);

/** A date in the person's time zone N days before today. */
export function daysBefore(today: string, n: number): string {
	return new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000)
		.toISOString()
		.slice(0, 10);
}
