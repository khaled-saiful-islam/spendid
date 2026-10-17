import { formatMinor, STREAK_MILESTONES, type Summary } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Flame, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { streakQuery } from "@/lib/delight-api";
import { buzz } from "@/lib/haptics";
import { usePipLook } from "@/lib/pip-wardrobe";
import { Pip, type PipMood } from "./Pip";
import { PipSheet } from "./PipSheet";

/** Pip's mood is today's money (and the clock). */
export function pipMood(
	summary: Summary | undefined,
	now = new Date(),
): PipMood {
	const h = now.getHours();
	if (h >= 23 || h < 6) return "sleepy";
	if (!summary || summary.safe.status === "no-income") return "calm";
	if (summary.safe.status === "over") return "curled";
	const ratio =
		summary.safe.dailyAllowanceMinor > 0
			? summary.safe.safeTodayMinor / summary.safe.dailyAllowanceMinor
			: 0;
	if (ratio < 0.2) return "worried";
	return ratio >= 0.6 ? "shining" : "calm";
}

function pipLine(mood: PipMood, summary: Summary | undefined): string {
	const money = (m: number) =>
		summary ? formatMinor(m, summary.homeCurrency) : "";
	const left = summary?.safe.safeTodayMinor ?? 0;
	switch (mood) {
		case "sleepy":
			return new Date().getHours() < 6
				? t("It's late. Rest up, I'll keep watch over your money.")
				: t("Getting late. Anything to log before bed? Then I'll keep watch.");
		case "curled":
			return t(
				"We went {amount} over today. I'm curled up, but tomorrow starts fresh.",
				{ amount: money(-left) },
			);
		case "worried":
			return t("Only {amount} left for today. Let's take it easy.", {
				amount: money(left),
			});
		case "shining":
			return t("{amount} left for today. You're doing great!", {
				amount: money(left),
			});
		default:
			return summary?.safe.status === "no-income"
				? t(
						"Add your monthly income in settings and I'll work out what's safe each day.",
					)
				: t("{amount} left for today. Right on track.", {
						amount: money(left),
					});
	}
}

const CELEBRATED = "spendid.streakCelebrated";
const LEVEL_SEEN = "spendid.pip.level";

const read = (key: string): string => {
	try {
		return localStorage.getItem(key) ?? "";
	} catch {
		return "";
	}
};
const write = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Storage blocked: it may show twice, which is harmless.
	}
};

/** Pip beside the greeting: a mood, one line about today, and the streak. */
export function PipCorner({ summary }: { summary: Summary | undefined }) {
	const { data: streak } = useQuery(streakQuery);
	const mood = pipMood(summary);
	const count = summary?.today.length ?? 0;
	// Null until today's data has loaded, so the first load isn't taken as "just logged".
	const lastCount = useRef<number | null>(null);
	const [bounce, setBounce] = useState(0);
	const [open, setOpen] = useState(false);
	const [gotIt, setGotIt] = useState(false);
	const look = usePipLook(streak);

	// Hop and say "got it" when something new is logged.
	useEffect(() => {
		if (!summary) return;
		if (lastCount.current !== null && count > lastCount.current) {
			setBounce((b) => b + 1);
			setGotIt(true);
			const timer = setTimeout(() => setGotIt(false), 4500);
			lastCount.current = count;
			return () => clearTimeout(timer);
		}
		lastCount.current = count;
	}, [count, summary]);

	// A new level brings a gift: show Pip wearing it, once.
	useEffect(() => {
		if (!streak) return;
		const seen = Number(read(LEVEL_SEEN) || "0");
		if (seen === 0) return write(LEVEL_SEEN, String(look.level.level));
		if (look.level.level > seen) {
			write(LEVEL_SEEN, String(look.level.level));
			toast(
				t("Pip grew into {title} and brought a gift!", {
					title: t(look.level.title),
				}),
			);
			buzz("success");
			setOpen(true);
		}
	}, [streak, look.level.level, look.level.title]);

	// Celebrate streak milestones once.
	useEffect(() => {
		if (
			!streak?.doneToday ||
			!(STREAK_MILESTONES as readonly number[]).includes(streak.current)
		)
			return;
		if (read(CELEBRATED) === String(streak.current)) return;
		write(CELEBRATED, String(streak.current));
		toast(t("{n}-day streak! Pip is proud of you.", { n: streak.current }));
		buzz("success");
		setBounce((b) => b + 1);
	}, [streak]);

	return (
		<div className="flex items-end gap-3">
			<div className="relative min-w-0 flex-1">
				<AnimatePresence mode="wait">
					<motion.p
						key={mood + String(summary?.safe.safeTodayMinor) + String(gotIt)}
						initial={{ opacity: 0, y: 6, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0 }}
						data-money
						className="relative rounded-[1.2rem] rounded-br-sm border border-line bg-surface px-4 py-3 text-[0.98rem] font-medium shadow-sm"
					>
						{gotIt && summary
							? t("Got it! {amount} left for today.", {
									amount: formatMinor(
										summary.safe.safeTodayMinor,
										summary.homeCurrency,
									),
								})
							: pipLine(mood, summary)}
					</motion.p>
				</AnimatePresence>
				{streak && (
					<div className="mt-2 flex flex-wrap gap-2">
						<p
							className="inline-flex items-center gap-1.5 rounded-full bg-marigold/20 px-3 py-1 text-[0.88rem] font-semibold"
							title={t("Best: {n} days", { n: streak.best })}
						>
							<Flame
								className={
									streak.doneToday
										? "size-4 text-coral"
										: "size-4 text-ink-soft"
								}
								aria-hidden="true"
							/>
							{streak.current === 0
								? t("Log something to start a streak")
								: t(
										streak.doneToday
											? "{n}-day streak"
											: "{n}-day streak, log today to keep it",
										{ n: streak.current },
									)}
						</p>
						{streak.shields > 0 && (
							<p
								className="inline-flex items-center gap-1.5 rounded-full bg-plum-500/12 px-3 py-1 text-[0.88rem] font-semibold"
								title={t("Shields cover a missed day")}
							>
								<Shield className="size-4 text-plum-500" aria-hidden="true" />
								{streak.shields === 1
									? t("1 shield")
									: t("{n} shields", { n: streak.shields })}
							</p>
						)}
					</div>
				)}
			</div>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="group relative shrink-0 rounded-[2rem] transition-transform hover:scale-[1.04] active:scale-95"
			>
				<Pip
					mood={mood}
					bounce={bounce}
					outfit={look.outfit}
					className="w-32 sm:w-40"
				/>
				<span className="sr-only">
					{t("Open Pip: today's briefing and wardrobe")}
				</span>
				<span
					aria-hidden="true"
					className="absolute top-0 left-0 rounded-full bg-plum-900 px-2 py-0.5 text-[0.72rem] font-bold text-marigold shadow-sm dark:bg-plum-50 dark:text-plum-900"
				>
					{t("Lv {n}", { n: look.level.level })}
				</span>
			</button>
			<PipSheet
				open={open}
				onClose={() => setOpen(false)}
				mood={mood}
				line={pipLine(mood, summary)}
				summary={summary}
				streak={streak}
				look={look}
			/>
		</div>
	);
}
