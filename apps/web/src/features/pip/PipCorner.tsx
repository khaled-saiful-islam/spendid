import { formatMinor, STREAK_MILESTONES, type Summary } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { Flame } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { streakQuery } from "@/lib/delight-api";
import { Pip, type PipMood } from "./Pip";

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

/** Pip beside the greeting: a mood, one line about today, and the streak. */
export function PipCorner({ summary }: { summary: Summary | undefined }) {
	const { data: streak } = useQuery(streakQuery);
	const mood = pipMood(summary);
	const count = summary?.today.length ?? 0;
	const lastCount = useRef(count);
	const [bounce, setBounce] = useState(0);

	// Hop when something new is logged.
	useEffect(() => {
		if (count > lastCount.current) setBounce((b) => b + 1);
		lastCount.current = count;
	}, [count]);

	// Celebrate streak milestones once.
	useEffect(() => {
		if (
			!streak?.doneToday ||
			!(STREAK_MILESTONES as readonly number[]).includes(streak.current)
		)
			return;
		let seen = "";
		try {
			seen = localStorage.getItem(CELEBRATED) ?? "";
		} catch {
			seen = "";
		}
		if (seen === String(streak.current)) return;
		try {
			localStorage.setItem(CELEBRATED, String(streak.current));
		} catch {
			// Storage blocked: celebrate anyway, maybe twice.
		}
		if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
			void confetti({
				particleCount: 120,
				spread: 80,
				origin: { y: 0.3 },
				colors: ["#FFB224", "#FF5C7A", "#7A4FC4", "#12B886"],
			});
		toast(t("{n}-day streak! Pip is proud of you.", { n: streak.current }));
		setBounce((b) => b + 1);
	}, [streak]);

	return (
		<div className="flex items-end gap-3">
			<div className="relative min-w-0 flex-1">
				<AnimatePresence mode="wait">
					<motion.p
						key={mood + String(summary?.safe.safeTodayMinor)}
						initial={{ opacity: 0, y: 6, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0 }}
						data-money
						className="relative rounded-[1.2rem] rounded-br-sm border border-line bg-surface px-4 py-3 text-[0.98rem] font-medium shadow-sm"
					>
						{pipLine(mood, summary)}
					</motion.p>
				</AnimatePresence>
				{streak && (
					<p
						className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-marigold/20 px-3 py-1 text-[0.88rem] font-semibold"
						title={t("Best: {n} days", { n: streak.best })}
					>
						<Flame
							className={
								streak.doneToday ? "size-4 text-coral" : "size-4 text-ink-soft"
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
				)}
			</div>
			<Pip mood={mood} bounce={bounce} className="w-32 shrink-0 sm:w-40" />
		</div>
	);
}
