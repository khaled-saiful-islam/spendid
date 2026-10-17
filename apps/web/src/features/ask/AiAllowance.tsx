import type { AiFeatureUse, AiUsage } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Keyboard, MessageCircle, Mic, ReceiptText, Store } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { dateLocale, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { api } from "@/lib/http";
import { atHourOn, formatDay } from "@/lib/time";

export const aiUsageQuery = {
	queryKey: ["ai-status"],
	queryFn: () => api<AiUsage>("/api/ai/usage"),
	staleTime: 30_000,
};

const SEGMENTS = 10;
const count = (n: number) => new Intl.NumberFormat(dateLocale()).format(n);

type Level = "plenty" | "some" | "low" | "off";

function levelOf(u: AiUsage): { level: Level; left: number } {
	if (!u.enabled || u.pausedForEveryone) return { level: "off", left: 0 };
	const left =
		u.limitTokens > 0 ? Math.max(0, 1 - u.usedTokens / u.limitTokens) : 0;
	return { level: left > 0.4 ? "plenty" : left > 0.15 ? "some" : "low", left };
}

const FILL: Record<Level, string> = {
	plenty: "bg-jade",
	some: "bg-marigold",
	low: "bg-coral",
	off: "bg-ink-soft/30",
};

/** A small segmented battery: how much AI is left this month. */
function Battery({
	left,
	level,
	big,
}: {
	left: number;
	level: Level;
	big?: boolean;
}) {
	const reduce = useReducedMotion();
	const filled =
		level === "off"
			? 0
			: Math.max(left > 0 ? 1 : 0, Math.round(left * SEGMENTS));
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center rounded-[0.45rem] border-2 border-ink/70 p-[2px]",
				big ? "h-9 gap-[3px] pr-[3px]" : "h-4 gap-[1.5px]",
			)}
			aria-hidden="true"
		>
			{Array.from({ length: SEGMENTS }, (_, i) => (
				<motion.span
					// Fixed segments; position is identity.
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length meter
					key={i}
					className={cn(
						"h-full rounded-[2px]",
						big ? "w-[7%] min-w-3" : "w-[3px]",
						i < filled ? FILL[level] : "bg-surface-2",
					)}
					initial={reduce ? false : { scaleY: 0.2, opacity: 0 }}
					animate={{ scaleY: 1, opacity: 1 }}
					transition={{
						delay: i * 0.035,
						type: "spring",
						stiffness: 400,
						damping: 24,
					}}
				/>
			))}
			<span
				className={cn(
					"rounded-r-sm bg-ink/70",
					big ? "ml-0.5 h-3.5 w-1" : "ml-px h-1.5 w-[2px]",
				)}
			/>
		</span>
	);
}

function shortLabel(u: AiUsage, level: Level): string {
	if (level === "off")
		return u.pausedForEveryone ? t("AI paused") : t("AI is off");
	if (u.left.questions === 0) return t("Used up");
	return t("{n} questions left", { n: count(u.left.questions) });
}

/** The header meter. Tapping it explains the allowance in plain words. */
export function AiAllowance() {
	const { data } = useQuery(aiUsageQuery);
	const [open, setOpen] = useState(false);
	if (!data) return null;
	const { level, left } = levelOf(data);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-2 rounded-full py-0.5 pr-1 text-[0.85rem] font-semibold text-ink-soft hover:text-ink"
			>
				<Battery left={left} level={level} />
				<span>{shortLabel(data, level)}</span>
			</button>
			<Sheet
				open={open}
				onClose={() => setOpen(false)}
				title={t("Your AI this month")}
			>
				<AllowanceDetails usage={data} level={level} left={left} />
			</Sheet>
		</>
	);
}

const FEATURE: Record<
	AiFeatureUse["key"],
	{ label: string; icon: ReactNode; uses: (n: number) => string }
> = {
	ask: {
		label: "Ask Spendid",
		icon: <MessageCircle className="size-5" aria-hidden="true" />,
		uses: (n) => (n === 1 ? t("1 question") : t("{n} questions", { n })),
	},
	voice: {
		label: "Voice",
		icon: <Mic className="size-5" aria-hidden="true" />,
		uses: (n) =>
			n === 1 ? t("1 phrase heard") : t("{n} phrases heard", { n }),
	},
	receipts: {
		label: "Receipts",
		icon: <ReceiptText className="size-5" aria-hidden="true" />,
		uses: (n) =>
			n === 1 ? t("1 receipt read") : t("{n} receipts read", { n }),
	},
	shops: {
		label: "Shop names",
		icon: <Store className="size-5" aria-hidden="true" />,
		uses: (n) =>
			n === 1 ? t("1 shop matched") : t("{n} shops matched", { n }),
	},
};

function AllowanceDetails({
	usage,
	level,
	left,
}: {
	usage: AiUsage;
	level: Level;
	left: number;
}) {
	const reduce = useReducedMotion();
	// The allowance resets at midnight starting that day, in the app's time zone.
	const resets = atHourOn(usage.resetsOn, 0);
	const days = Math.max(
		1,
		Math.ceil((resets.getTime() - Date.now()) / 86_400_000),
	);
	const shown = usage.features.filter((f) => f.tokens > 0 || f.uses > 0);
	const most = Math.max(1, ...shown.map((f) => f.tokens));

	return (
		<div className="space-y-6">
			{level === "off" ? (
				<p className="rounded-tile bg-surface-2 p-4">
					{usage.pausedForEveryone
						? t(
								"AI features are paused for a moment for everyone. Typing still works.",
							)
						: t(
								"AI is turned off for your account. Typing expenses still works.",
							)}
				</p>
			) : (
				<div className="space-y-4">
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div>
							<p className="font-display text-[clamp(2.4rem,9vw,3.2rem)] leading-none font-extrabold">
								{usage.left.questions > 0
									? t("About {n}", { n: count(usage.left.questions) })
									: t("Used up")}
							</p>
							<p className="mt-1 font-semibold">
								{usage.left.questions > 0
									? t("more questions this month")
									: t("Ask, voice and receipts are back on {date}.", {
											date: formatDay(usage.resetsOn, {
												day: "numeric",
												month: "long",
											}),
										})}
							</p>
						</div>
						<Battery left={left} level={level} big />
					</div>
					{usage.left.questions > 0 && (
						<p className="text-ink-soft">
							{t(
								"Or about {voice} voice notes, or {receipts} receipts. Mix them however you like.",
								{
									voice: count(usage.left.voiceNotes),
									receipts: count(usage.left.receipts),
								},
							)}
						</p>
					)}
				</div>
			)}

			{shown.length > 0 && (
				<section aria-labelledby="ai-where" className="space-y-3">
					<h3 id="ai-where" className="font-display text-[1.15rem] font-bold">
						{t("Where it went")}
					</h3>
					<ul className="space-y-3">
						{shown.map((f, i) => {
							const info = FEATURE[f.key];
							return (
								<li key={f.key} className="flex items-center gap-3">
									<span className="grid size-10 shrink-0 place-items-center rounded-full bg-plum-500/10 text-plum-500">
										{info.icon}
									</span>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex flex-wrap items-baseline justify-between gap-x-3">
											<span className="font-semibold">{t(info.label)}</span>
											{f.uses > 0 && (
												<span className="text-[0.88rem] text-ink-soft">
													{info.uses(f.uses)}
												</span>
											)}
										</div>
										<div className="h-2 overflow-hidden rounded-full bg-surface-2">
											<motion.div
												className="h-full rounded-full bg-plum-500"
												initial={{
													width: reduce ? `${(f.tokens / most) * 100}%` : 0,
												}}
												animate={{ width: `${(f.tokens / most) * 100}%` }}
												transition={{
													delay: 0.1 + i * 0.08,
													duration: 0.7,
													ease: "easeOut",
												}}
											/>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			)}

			<p className="text-ink-soft">
				{days === 1
					? t("A fresh allowance starts tomorrow.")
					: t("A fresh allowance starts on {date}, in {n} days.", {
							date: formatDay(usage.resetsOn, {
								day: "numeric",
								month: "long",
							}),
							n: days,
						})}
			</p>
			<p className="flex items-start gap-3 rounded-tile bg-jade/10 p-4 text-[0.95rem]">
				<Keyboard
					className="mt-0.5 size-5 shrink-0 text-safe"
					aria-hidden="true"
				/>
				<span>
					{t(
						"Typing expenses never uses AI, so you can always log. Only you see this; Spendid counts usage, never what you asked.",
					)}
				</span>
			</p>
		</div>
	);
}
