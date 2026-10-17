import {
	daysUntil,
	formatMinor,
	PIP_LEVELS,
	type PipGift,
	type Streak,
	type Summary,
} from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	CalendarClock,
	Flame,
	Lock,
	Plus,
	Shield,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { categoriesQuery } from "@/lib/money-api";
import { HATS, type usePipLook } from "@/lib/pip-wardrobe";
import { subscriptionsQuery } from "@/lib/subscriptions-api";
import { capture } from "../capture/capture-store";
import { Pip, type PipMood } from "./Pip";
import { outfitFor } from "./PipOutfit";

const GIFT_NAME: Record<PipGift, string> = {
	leaf: "Lucky leaf",
	scarf: "Batik scarf",
	explorer: "Explorer hat",
	shades: "Sunglasses",
	crown: "Little crown",
	medal: "Gold coin medal",
};

interface SheetProps {
	open: boolean;
	onClose: () => void;
	mood: PipMood;
	line: string;
	summary: Summary | undefined;
	streak: Streak | undefined;
	look: ReturnType<typeof usePipLook>;
}

/** Tap Pip: today's briefing from real numbers, Pip's level and wardrobe, and quick actions. */
export function PipSheet({
	open,
	onClose,
	mood,
	line,
	summary,
	streak,
	look,
}: SheetProps) {
	const reduce = useReducedMotion();
	const { level } = look;
	const logged = streak?.loggedDays ?? 0;
	const prev = PIP_LEVELS[level.level - 1]?.days ?? 0;
	const progress = level.next ? (logged - prev) / (level.next.days - prev) : 1;

	return (
		<Sheet open={open} onClose={onClose} title={t(level.title)}>
			<div className="space-y-6">
				<div className="flex items-end gap-4">
					<Pip
						mood={mood}
						outfit={look.outfit}
						bounce={open ? 1 : 0}
						className="w-36 shrink-0"
					/>
					<div className="min-w-0 flex-1 space-y-2 pb-2">
						<p className="text-[0.88rem] font-semibold text-ink-soft">
							{t("Level {n}", { n: level.level })}
						</p>
						<div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
							<motion.div
								className="h-full rounded-full bg-marigold"
								initial={{ width: reduce ? `${progress * 100}%` : 0 }}
								animate={{ width: `${Math.min(1, progress) * 100}%` }}
								transition={{ duration: 0.8, ease: "easeOut" }}
							/>
						</div>
						<p className="text-[0.92rem] text-ink-soft">
							{level.next
								? t(
										"{n} more days of logging to {title}, who brings a {gift}.",
										{
											n: level.next.days - logged,
											title: t(level.next.title),
											gift: t(GIFT_NAME[level.next.gift]).toLowerCase(),
										},
									)
								: t("Pip has every gift. Legendary.")}
						</p>
					</div>
				</div>

				<section aria-labelledby="pip-today" className="space-y-2">
					<h3 id="pip-today" className="font-display text-[1.15rem] font-bold">
						{t("Today, from Pip")}
					</h3>
					<ul className="space-y-2">
						<Fact icon={<Sparkles className="size-5" aria-hidden="true" />}>
							{line}
						</Fact>
						<NextBill summary={summary} />
						{streak && streak.current > 0 && (
							<Fact icon={<Flame className="size-5" aria-hidden="true" />}>
								{t("{n}-day streak", { n: streak.current })}
								{streak.shields > 0 &&
									`. ${streak.shields === 1 ? t("1 shield ready: a missed day won't break it.") : t("{n} shields ready: missed days won't break it.", { n: streak.shields })}`}
							</Fact>
						)}
						{streak && streak.shieldedDays.length > 0 && (
							<Fact icon={<Shield className="size-5" aria-hidden="true" />}>
								{t("A shield covered a missed day, so your streak lives on.")}
							</Fact>
						)}
						<TopCategory summary={summary} />
					</ul>
				</section>

				<div className="grid grid-cols-2 gap-2">
					<button
						type="button"
						onClick={() => {
							onClose();
							capture.openMenu();
						}}
						className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-marigold font-semibold text-plum-900 shadow-coin"
					>
						<Plus className="size-5" aria-hidden="true" /> {t("Log something")}
					</button>
					<Link
						to="/app/ask"
						onClick={onClose}
						className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 border-line font-semibold hover:bg-surface-2"
					>
						<Sparkles className="size-5 text-plum-500" aria-hidden="true" />{" "}
						{t("Ask Spendid")}
					</Link>
				</div>

				<section aria-labelledby="pip-wardrobe" className="space-y-3">
					<h3
						id="pip-wardrobe"
						className="font-display text-[1.15rem] font-bold"
					>
						{t("Pip's wardrobe")}
					</h3>
					<p className="text-[0.92rem] text-ink-soft">
						{t(
							"Every day you log, Pip grows. Tap a gift to wear it or take it off.",
						)}
					</p>
					<ul className="grid grid-cols-3 gap-2">
						{PIP_LEVELS.slice(1).map((l) => {
							const gift = l.gift as PipGift;
							const owned = level.gifts.includes(gift);
							const on =
								owned &&
								(HATS.includes(gift)
									? look.outfit.hat === gift
									: !look.hidden.includes(gift));
							return (
								<li key={gift}>
									<button
										type="button"
										disabled={!owned}
										aria-pressed={owned ? on : undefined}
										onClick={() => look.toggle(gift)}
										className={cn(
											"flex h-full w-full flex-col items-center gap-1 rounded-tile border-2 p-2 text-center",
											on ? "border-plum-500 bg-plum-500/8" : "border-line",
											!owned && "opacity-70",
										)}
									>
										<span className="relative">
											<Pip
												mood="calm"
												outfit={outfitFor([gift], null)}
												className={cn("w-20", !owned && "grayscale")}
											/>
											{!owned && (
												<Lock
													className="absolute right-0 bottom-1 size-4 text-ink-soft"
													aria-hidden="true"
												/>
											)}
										</span>
										<span className="text-[0.8rem] leading-tight font-semibold">
											{t(GIFT_NAME[gift])}
										</span>
										<span className="text-[0.75rem] text-ink-soft">
											{owned
												? on
													? t("Wearing")
													: t("Put on")
												: t("{n} days", { n: l.days })}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</section>
			</div>
		</Sheet>
	);
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
	return (
		<li
			data-money
			className="flex items-start gap-3 rounded-tile bg-surface-2 p-3"
		>
			<span className="mt-0.5 shrink-0 text-plum-500">{icon}</span>
			<span className="min-w-0">{children}</span>
		</li>
	);
}

/** The next thing due: one of the person's subscriptions, else a bill found in spending. */
function NextBill({ summary }: { summary: Summary | undefined }) {
	const { data: subs } = useQuery(subscriptionsQuery);
	const next = subs?.active[0];
	if (subs && next) {
		const d = daysUntil(next.nextDue, subs.today);
		return (
			<Fact icon={<CalendarClock className="size-5" aria-hidden="true" />}>
				{t("{name} ({amount}) is due {when}. Already kept aside.", {
					name: next.name,
					amount: formatMinor(next.amountMinor, next.currency),
					when:
						d <= 0
							? t("today")
							: d === 1
								? t("tomorrow")
								: t("in {n} days", { n: d }),
				})}
			</Fact>
		);
	}
	const bill = summary?.bills.items[0];
	if (!bill || !summary) return null;
	return (
		<Fact icon={<CalendarClock className="size-5" aria-hidden="true" />}>
			{t("{name} ({amount}) usually lands soon. Already kept aside.", {
				name: bill.merchant,
				amount: formatMinor(bill.amountMinor, summary.homeCurrency),
			})}
		</Fact>
	);
}

/** Where most of this month's money went, as a share. */
function TopCategory({ summary }: { summary: Summary | undefined }) {
	const { data: categories = [] } = useQuery(categoriesQuery);
	if (!summary || summary.monthSpentMinor <= 0) return null;
	const top = [...summary.byCategory].sort(
		(a, b) => b.spentMinor - a.spentMinor,
	)[0];
	const cat = categories.find((c) => c.id === top?.categoryId);
	if (!top || !cat) return null;
	return (
		<Fact icon={<TrendingUp className="size-5" aria-hidden="true" />}>
			{t("Most of this month went to {category}: {amount} ({pct}%).", {
				category: cat.name,
				amount: formatMinor(top.spentMinor, summary.homeCurrency),
				pct: Math.round((top.spentMinor / summary.monthSpentMinor) * 100),
			})}
		</Fact>
	);
}
