import { formatMinor, type Wrapped } from "@spendid/shared";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { CountUp } from "@/components/money/CountUp";
import { monthName, shiftMonth } from "@/lib/insights-api";

export interface Slide {
	id: string;
	/** Background gradient for the whole screen. */
	bg: string;
	/** Text colour that keeps contrast on `bg`. */
	ink: "light" | "dark";
	body: ReactNode;
}

const WEEKDAY = [
	"Sundays",
	"Mondays",
	"Tuesdays",
	"Wednesdays",
	"Thursdays",
	"Fridays",
	"Saturdays",
];

function Rise({
	children,
	delay = 0,
}: {
	children: ReactNode;
	delay?: number;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay, type: "spring", stiffness: 140, damping: 18 }}
		>
			{children}
		</motion.div>
	);
}

const Kicker = ({ children }: { children: ReactNode }) => (
	<p className="text-[1.15rem] font-semibold opacity-85">{children}</p>
);
const Big = ({ children }: { children: ReactNode }) => (
	<h2 className="mt-2 text-[clamp(2.3rem,10vw,3.6rem)] leading-[1.02] font-extrabold text-balance">
		{children}
	</h2>
);
const Line = ({ children }: { children: ReactNode }) => (
	<p className="mt-4 max-w-[30ch] text-[1.15rem] opacity-95">{children}</p>
);

/** The story, one idea per slide. Slides with nothing to say are left out. */
export function buildSlides(d: Wrapped): Slide[] {
	const money = (minor: number) => formatMinor(minor, d.currency);
	const name = monthName(d.month, { month: "long" });
	const prevName = monthName(shiftMonth(d.month, -1), { month: "long" });
	const diff = d.totalMinor - d.previousMinor;
	const top = d.categories[0];
	const kindTotal = d.kinds.need + d.kinds.want + d.kinds.saving || 1;
	const slides: (Slide | null)[] = [
		{
			id: "intro",
			bg: "from-plum-950 via-plum-800 to-plum-500",
			ink: "light",
			body: (
				<>
					<Rise>
						<motion.span
							className="block text-[6rem] leading-none"
							initial={{ scale: 0, rotate: -30 }}
							animate={{ scale: 1, rotate: 0 }}
							transition={{ type: "spring", stiffness: 200, damping: 12 }}
						>
							{d.personality.emoji}
						</motion.span>
					</Rise>
					<Rise delay={0.15}>
						<Big>
							{d.inProgress ? `${name}, so far` : `Your ${name}, wrapped`}
						</Big>
					</Rise>
					<Rise delay={0.3}>
						<Line>Let's look back at where your money went.</Line>
					</Rise>
				</>
			),
		},
		{
			id: "total",
			bg: "from-plum-950 via-plum-800 to-plum-500",
			ink: "light",
			body: (
				<>
					<Kicker>You spent</Kicker>
					<CountUp
						minor={d.totalMinor}
						currency={d.currency}
						className="num mt-2 block text-[clamp(2.8rem,13vw,4.6rem)] leading-none font-extrabold"
					/>
					<Rise delay={0.4}>
						<Line>
							{d.count} expenses on {d.activeDays}{" "}
							{d.activeDays === 1 ? "day" : "days"}.{" "}
							{d.previousMinor > 0 &&
								(diff > 0
									? `${money(diff)} more than ${prevName}.`
									: `${money(-diff)} less than ${prevName}.`)}
						</Line>
					</Rise>
				</>
			),
		},
		top
			? {
					id: "category",
					bg: "from-marigold via-orange-300 to-coral",
					ink: "dark",
					body: (
						<>
							<Kicker>Most of it went to</Kicker>
							<Big>
								{top.name}, {Math.round(top.share * 100)}%
							</Big>
							<ul className="mt-6 space-y-3">
								{d.categories.map((c, i) => (
									<motion.li
										key={c.name}
										className="flex items-center gap-3"
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: 0.2 + i * 0.1 }}
									>
										<CategoryIcon icon={c.icon} tint={c.tint} size="sm" />
										<span className="min-w-0 flex-1">
											<span className="flex justify-between gap-3 font-semibold">
												<span className="break-words">{c.name}</span>
												<span className="num">{money(c.minor)}</span>
											</span>
											<span className="mt-1 block h-2 rounded-full bg-plum-950/15">
												<motion.span
													className="block h-full rounded-full bg-plum-900"
													initial={{ width: 0 }}
													animate={{ width: `${Math.max(3, c.share * 100)}%` }}
													transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
												/>
											</span>
										</span>
									</motion.li>
								))}
							</ul>
						</>
					),
				}
			: null,
		d.biggestDay
			? {
					id: "day",
					bg: "from-sky-900 via-plum-800 to-plum-950",
					ink: "light",
					body: (
						<>
							<Kicker>Your biggest day</Kicker>
							<Big>
								{new Date(`${d.biggestDay.day}T12:00`).toLocaleDateString(
									undefined,
									{ weekday: "long", day: "numeric", month: "long" },
								)}
							</Big>
							<Line>
								{money(d.biggestDay.minor)} across {d.biggestDay.count}{" "}
								{d.biggestDay.count === 1 ? "expense" : "expenses"}.
								{d.busiestWeekday &&
									` ${WEEKDAY[d.busiestWeekday.weekday]} cost you the most overall.`}
							</Line>
						</>
					),
				}
			: null,
		d.topMerchant
			? {
					id: "place",
					bg: "from-emerald-900 via-teal-800 to-plum-950",
					ink: "light",
					body: (
						<>
							<Kicker>Your favourite place</Kicker>
							<Big>{d.topMerchant.name}</Big>
							<Line>
								{d.topMerchant.visits}{" "}
								{d.topMerchant.visits === 1 ? "visit" : "visits"},{" "}
								{money(d.topMerchant.minor)} in all.
							</Line>
						</>
					),
				}
			: null,
		{
			id: "rhythm",
			bg: "from-plum-950 via-plum-900 to-emerald-900",
			ink: "light",
			body: (
				<>
					<Kicker>Your rhythm</Kicker>
					<Big>
						{d.noSpendDays} no-spend {d.noSpendDays === 1 ? "day" : "days"}
					</Big>
					<div
						className="mt-6 flex h-4 overflow-hidden rounded-full bg-white/20"
						aria-hidden="true"
					>
						<motion.span
							className="bg-sky"
							initial={{ width: 0 }}
							animate={{ width: `${(d.kinds.need / kindTotal) * 100}%` }}
							transition={{ duration: 0.8 }}
						/>
						<motion.span
							className="bg-marigold"
							initial={{ width: 0 }}
							animate={{ width: `${(d.kinds.want / kindTotal) * 100}%` }}
							transition={{ duration: 0.8, delay: 0.2 }}
						/>
						<motion.span
							className="bg-jade"
							initial={{ width: 0 }}
							animate={{ width: `${(d.kinds.saving / kindTotal) * 100}%` }}
							transition={{ duration: 0.8, delay: 0.4 }}
						/>
					</div>
					<Line>
						Needs {Math.round((d.kinds.need / kindTotal) * 100)}%, wants{" "}
						{Math.round((d.kinds.want / kindTotal) * 100)}%.
						{d.subscriptionsMonthlyMinor > 0 &&
							` Subscriptions and bills run about ${money(d.subscriptionsMonthlyMinor)} a month.`}
						{d.savedMinor > 0 &&
							` You put ${money(d.savedMinor)} into your goals.`}
					</Line>
				</>
			),
		},
		{
			id: "personality",
			bg: "from-marigold via-orange-300 to-coral",
			ink: "dark",
			body: (
				<>
					<Kicker>
						{d.inProgress ? "So far you're" : "This month you were"}
					</Kicker>
					<Rise delay={0.1}>
						<span className="mt-3 block text-[5.5rem] leading-none">
							{d.personality.emoji}
						</span>
					</Rise>
					<Big>{d.personality.title}</Big>
					<Line>{d.personality.line}</Line>
				</>
			),
		},
	];
	return slides.filter((s): s is Slide => s !== null);
}
