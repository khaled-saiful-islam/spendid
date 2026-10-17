import {
	CHALLENGE_KINDS,
	CHALLENGES,
	type ChallengeBoard,
	type ChallengeKind,
	type ChallengeView,
	formatMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trophy, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { dateLocale, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { challengesQuery, delightApi } from "@/lib/delight-api";
import { buzz } from "@/lib/haptics";
import { ApiError } from "@/lib/http";

const weekday = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(dateLocale(), {
		weekday: "narrow",
	});
const shortDate = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(dateLocale(), {
		day: "numeric",
		month: "short",
	});

/** Plan: challenges tracked from spending, with day-by-day progress and won badges. */
export function Challenges() {
	const { data } = useQuery(challengesQuery);
	const [picking, setPicking] = useState(false);
	if (!data) return null;

	return (
		<section aria-labelledby="challenges-title" className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 id="challenges-title" className="text-[1.6rem] font-bold">
					{t("Challenges")}
				</h2>
				<button
					type="button"
					onClick={() => setPicking(true)}
					className={buttonClass("ghost", "md", "border-2 border-line")}
				>
					<Plus className="size-5" aria-hidden="true" /> {t("Start one")}
				</button>
			</div>

			{data.active.length === 0 ? (
				<button
					type="button"
					onClick={() => setPicking(true)}
					className="w-full rounded-panel border-2 border-dashed border-line p-5 text-left hover:border-plum-300"
				>
					<span className="block font-semibold">
						{t("A small challenge makes a habit stick.")}
					</span>
					<span className="block text-ink-soft">
						{t(
							"Try a no-spend weekend or a cook-at-home week. Spendid checks it from your spending, so there's nothing to tick off.",
						)}
					</span>
				</button>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{data.active.map((c) => (
						<li key={c.id}>
							<ChallengeCard challenge={c} today={data.today} />
						</li>
					))}
				</ul>
			)}

			{data.won.length > 0 && (
				<div className="space-y-2">
					<p className="font-semibold">{t("Won")}</p>
					<ul className="flex flex-wrap gap-2">
						{data.won.map((c) => (
							<li
								key={c.id}
								className="inline-flex items-center gap-2 rounded-full bg-marigold/20 px-3 py-1.5 text-[0.88rem] font-semibold"
							>
								<Trophy
									className="size-4 text-marigold-deep"
									aria-hidden="true"
								/>
								{CHALLENGES[c.kind].emoji} {t(CHALLENGES[c.kind].title)},{" "}
								{shortDate(c.end)}
							</li>
						))}
					</ul>
				</div>
			)}

			<StartSheet
				open={picking}
				onClose={() => setPicking(false)}
				board={data}
			/>
		</section>
	);
}

function ChallengeCard({
	challenge: c,
	today,
}: {
	challenge: ChallengeView;
	today: string;
}) {
	const queryClient = useQueryClient();
	const reduce = useReducedMotion();
	const info = CHALLENGES[c.kind];
	const passed = c.result.days.filter((d) => d.state === "pass").length;
	const notStarted = today < c.start;
	const status =
		c.result.status === "lost"
			? t("This one slipped. Start it again whenever you like.")
			: c.result.status === "won"
				? t("Done! Well played.")
				: notStarted
					? t("Starts {date}.", { date: shortDate(c.start) })
					: t("{passed} of {total} days done.", {
							passed,
							total: c.result.days.length,
						});

	return (
		<article
			className={cn(
				"flex h-full flex-col rounded-panel border bg-surface p-4",
				c.result.status === "lost" ? "border-coral/40" : "border-line",
			)}
		>
			<div className="flex items-start gap-3">
				<span className="text-[1.8rem] leading-none" aria-hidden="true">
					{info.emoji}
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="font-bold">{t(info.title)}</h3>
					<p className="text-[0.9rem] text-ink-soft">{t(info.body)}</p>
				</div>
			</div>
			<ol className="mt-4 flex flex-wrap gap-1.5" aria-label={t("Days")}>
				{c.result.days.map((d, i) => (
					<motion.li
						key={d.day}
						initial={reduce ? false : { scale: 0.6, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ delay: i * 0.04 }}
						aria-label={`${shortDate(d.day)}: ${d.state === "pass" ? t("kept") : d.state === "fail" ? t("broken") : t("still to come")}`}
						className={cn(
							"grid size-9 place-items-center rounded-full text-[0.75rem] font-bold",
							d.state === "pass" && "bg-jade text-white",
							d.state === "fail" && "bg-coral text-white",
							d.state === "pending" && "bg-surface-2 text-ink-soft",
							d.day === today &&
								"ring-2 ring-marigold ring-offset-2 ring-offset-surface",
						)}
					>
						{d.state === "pass" ? (
							<Check className="size-4" aria-hidden="true" />
						) : d.state === "fail" ? (
							<X className="size-4" aria-hidden="true" />
						) : (
							weekday(d.day)
						)}
					</motion.li>
				))}
			</ol>
			{c.result.usedMinor !== null && c.targetMinor && (
				<p data-money className="mt-3 text-[0.9rem]">
					{t("{used} of {target} used.", {
						used: formatMinor(c.result.usedMinor, c.currency),
						target: formatMinor(c.targetMinor, c.currency),
					})}
				</p>
			)}
			{c.kind === "daily-cap" && c.targetMinor && (
				<p data-money className="mt-3 text-[0.9rem]">
					{t("Target: under {amount} a day.", {
						amount: formatMinor(c.targetMinor, c.currency),
					})}
				</p>
			)}
			<p className="mt-2 font-semibold">{status}</p>
			{c.result.status === "active" && (
				<button
					type="button"
					onClick={() =>
						void delightApi
							.giveUpChallenge(c.id)
							.then(() =>
								queryClient.invalidateQueries({
									queryKey: challengesQuery.queryKey,
								}),
							)
							.catch(() => toast(t("Couldn't save. Try again.")))
					}
					className="mt-auto self-start pt-3 text-[0.9rem] font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
				>
					{t("Stop this challenge")}
				</button>
			)}
		</article>
	);
}

function StartSheet({
	open,
	onClose,
	board,
}: {
	open: boolean;
	onClose: () => void;
	board: ChallengeBoard;
}) {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState<ChallengeKind | null>(null);
	const running = new Set(
		board.active.filter((c) => c.result.status === "active").map((c) => c.kind),
	);
	const cur = board.active[0]?.currency ?? "MYR";

	async function start(kind: ChallengeKind) {
		setPending(kind);
		try {
			await delightApi.startChallenge({ kind });
			await queryClient.invalidateQueries({
				queryKey: challengesQuery.queryKey,
			});
			buzz("success");
			toast(
				t("{title} started. Spendid will keep track.", {
					title: t(CHALLENGES[kind].title),
				}),
			);
			onClose();
		} catch (err) {
			toast(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
		} finally {
			setPending(null);
		}
	}

	return (
		<Sheet open={open} onClose={onClose} title={t("Pick a challenge")}>
			<ul className="space-y-2">
				{CHALLENGE_KINDS.map((kind) => {
					const info = CHALLENGES[kind];
					const target =
						kind === "eat-out-cap"
							? t("Your target: {amount} this week.", {
									amount: formatMinor(board.suggested.eatOutWeekMinor, cur),
								})
							: kind === "daily-cap"
								? t("Your target: under {amount} a day.", {
										amount: formatMinor(board.suggested.dailyMinor, cur),
									})
								: null;
					return (
						<li key={kind}>
							<button
								type="button"
								disabled={running.has(kind) || pending !== null}
								onClick={() => void start(kind)}
								className="flex w-full items-start gap-3 rounded-tile border border-line p-3 text-left hover:border-plum-300 hover:bg-surface-2 disabled:opacity-50"
							>
								<span className="text-[1.6rem] leading-none" aria-hidden="true">
									{info.emoji}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block font-semibold">{t(info.title)}</span>
									<span className="block text-[0.9rem] text-ink-soft">
										{t(info.body)}
									</span>
									{target && (
										<span
											data-money
											className="mt-1 block text-[0.88rem] font-semibold text-plum-500"
										>
											{target}
										</span>
									)}
									{running.has(kind) && (
										<span className="mt-1 block text-[0.85rem] font-semibold text-safe">
											{t("Running now")}
										</span>
									)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</Sheet>
	);
}
