import {
	brandForName,
	brandOf,
	daysUntil,
	type Subscription,
} from "@spendid/shared";
import {
	Building2,
	Car,
	CreditCard,
	Droplets,
	Dumbbell,
	Flame,
	House,
	Landmark,
	type LucideIcon,
	ShieldCheck,
} from "lucide-react";
import {
	type SimpleIcon,
	si1password,
	siApplearcade,
	siApplemusic,
	siAppletv,
	siAudible,
	siBitwarden,
	siClaude,
	siCoursera,
	siCrunchyroll,
	siCursor,
	siDeezer,
	siDiscord,
	siDropbox,
	siDuolingo,
	siEa,
	siEvernote,
	siExpressvpn,
	siFigma,
	siFoodpanda,
	siGithubcopilot,
	siGoogle,
	siGooglegemini,
	siGrab,
	siGrammarly,
	siHbomax,
	siHeadspace,
	siIcloud,
	siMedium,
	siNetflix,
	siNordvpn,
	siNotion,
	siParamountplus,
	siPatreon,
	siPerplexity,
	siPlaystation,
	siProton,
	siShopee,
	siSoundcloud,
	siSpotify,
	siStrava,
	siSurfshark,
	siTelegram,
	siTidal,
	siTinder,
	siTodoist,
	siUbisoft,
	siX,
	siYoutube,
	siYoutubemusic,
	siZoom,
} from "simple-icons";
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

/** Logos used by the catalogue: explicit imports keep only these in the bundle. */
export const LOGOS: Record<string, SimpleIcon> = {
	si1password,
	siApplearcade,
	siApplemusic,
	siAppletv,
	siAudible,
	siBitwarden,
	siClaude,
	siCoursera,
	siCrunchyroll,
	siCursor,
	siDeezer,
	siDiscord,
	siDropbox,
	siDuolingo,
	siEa,
	siEvernote,
	siExpressvpn,
	siFigma,
	siFoodpanda,
	siGithubcopilot,
	siGoogle,
	siGooglegemini,
	siGrab,
	siGrammarly,
	siHbomax,
	siHeadspace,
	siIcloud,
	siMedium,
	siNetflix,
	siNordvpn,
	siNotion,
	siParamountplus,
	siPatreon,
	siPerplexity,
	siPlaystation,
	siProton,
	siShopee,
	siSoundcloud,
	siSpotify,
	siStrava,
	siSurfshark,
	siTelegram,
	siTidal,
	siTinder,
	siTodoist,
	siUbisoft,
	siX,
	siYoutube,
	siYoutubemusic,
	siZoom,
};

const GENERIC: Record<string, LucideIcon> = {
	Building2,
	Car,
	CreditCard,
	Droplets,
	Dumbbell,
	Flame,
	House,
	Landmark,
	ShieldCheck,
};

/** White on dark colours, near-black on light ones (yellow tiles stay readable). */
function inkOn(hex: string): string {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#1F1A2E" : "#FFFFFF";
}

export function looksOf(sub: Pick<Subscription, "brand" | "name">): {
	color: string;
	ink: string;
	initials: string;
	logo?: SimpleIcon;
	Icon?: LucideIcon;
} {
	// A known key, or a typed name like "Netflix Premium", gets the service's own look.
	const brand = brandOf(sub.brand) ?? brandForName(sub.name);
	if (brand)
		return {
			color: brand.color,
			ink: inkOn(brand.color),
			initials: brand.initials,
			logo: brand.logo ? LOGOS[brand.logo] : undefined,
			Icon: brand.icon ? GENERIC[brand.icon] : undefined,
		};
	const words = sub.name.trim().split(/\s+/).filter(Boolean);
	const initials =
		words.length > 1
			? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
			: (words[0] ?? "?").slice(0, 2);
	const color = CUSTOM[hash(sub.name) % CUSTOM.length] ?? "#7A4FC4";
	return { color, ink: inkOn(color), initials: initials.toUpperCase() };
}

/**
 * A service's tile: its logo where the brand offers one (Simple Icons), else a simple icon or
 * its initials, on the brand colour. Decorative: the name is always shown beside it.
 */
export function BrandTile({
	sub,
	size = "md",
	className,
}: {
	sub: Pick<Subscription, "brand" | "name">;
	size?: "sm" | "md" | "lg";
	className?: string;
}) {
	const { color, ink, initials, logo, Icon } = looksOf(sub);
	return (
		<span
			aria-hidden="true"
			style={{ backgroundColor: color, color: ink }}
			className={cn(
				"grid shrink-0 place-items-center rounded-[28%] font-display font-extrabold shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]",
				size === "sm" && "size-9 text-[0.72rem]",
				size === "md" && "size-12 text-[0.9rem]",
				size === "lg" && "size-16 text-[1.15rem]",
				className,
			)}
		>
			{logo ? (
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					className="size-[52%]"
					fill="currentColor"
				>
					<path d={logo.path} />
				</svg>
			) : Icon ? (
				<Icon className="size-[50%]" />
			) : (
				initials
			)}
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
	soon: "bg-marigold/22 text-warn",
	later: "bg-surface-2 text-ink-soft",
};

export const CYCLE_LABEL: Record<Subscription["cycle"], string> = {
	weekly: "a week",
	monthly: "a month",
	quarterly: "every 3 months",
	yearly: "a year",
};
