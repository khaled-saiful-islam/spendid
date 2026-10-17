import { brandOf, daysUntil, type Subscription } from "@spendid/shared";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

/** Colours for subscriptions without a known brand, picked from the name so they stay put. */
const CUSTOM = [
	"#7A4FC4",
	"#0F766E",
	"#B45309",
	"#BE185D",
	"#1D4ED8",
	"#4D7C0F",
];

function hash(s: string): number {
	let h = 0;
	for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
	return h;
}

export function looksOf(sub: Pick<Subscription, "brand" | "name">): {
	color: string;
	initials: string;
} {
	const brand = brandOf(sub.brand);
	if (brand) return { color: brand.color, initials: brand.initials };
	const words = sub.name.trim().split(/\s+/).filter(Boolean);
	const initials =
		words.length > 1
			? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
			: (words[0] ?? "?").slice(0, 2);
	return {
		color: CUSTOM[hash(sub.name) % CUSTOM.length] ?? "#7A4FC4",
		initials: initials.toUpperCase(),
	};
}

/** A coloured square with the service's initials. Decorative: the name is always shown beside it. */
export function BrandTile({
	sub,
	size = "md",
	className,
}: {
	sub: Pick<Subscription, "brand" | "name">;
	size?: "sm" | "md" | "lg";
	className?: string;
}) {
	const { color, initials } = looksOf(sub);
	return (
		<span
			aria-hidden="true"
			style={{ backgroundColor: color }}
			className={cn(
				"grid shrink-0 place-items-center rounded-[28%] font-display font-extrabold text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]",
				size === "sm" && "size-9 text-[0.72rem]",
				size === "md" && "size-12 text-[0.9rem]",
				size === "lg" && "size-16 text-[1.15rem]",
				className,
			)}
		>
			{initials}
		</span>
	);
}

export type DueTone = "paid" | "overdue" | "today" | "soon" | "later";

/** Plain words for when something is due, and how urgent it is. */
export function dueLabel(
	day: string,
	today: string,
	paid = false,
): { text: string; tone: DueTone } {
	if (paid) return { text: t("Paid"), tone: "paid" };
	const d = daysUntil(day, today);
	if (d < 0)
		return {
			text: d === -1 ? t("1 day late") : t("{n} days late", { n: -d }),
			tone: "overdue",
		};
	if (d === 0) return { text: t("Due today"), tone: "today" };
	if (d === 1) return { text: t("Due tomorrow"), tone: "soon" };
	return { text: t("In {n} days", { n: d }), tone: d <= 5 ? "soon" : "later" };
}

export const TONE_CLASS: Record<DueTone, string> = {
	paid: "bg-jade/12 text-safe",
	overdue: "bg-coral/14 text-over",
	today: "bg-coral/14 text-over",
	soon: "bg-marigold/22 text-marigold-deep",
	later: "bg-surface-2 text-ink-soft",
};

export const CYCLE_LABEL: Record<Subscription["cycle"], string> = {
	weekly: "a week",
	monthly: "a month",
	quarterly: "every 3 months",
	yearly: "a year",
};
