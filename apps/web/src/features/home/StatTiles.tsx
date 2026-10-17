import { formatMinor, type Goal, type Summary } from "@spendid/shared";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Receipt, Target, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { goalTint } from "../plan/goal-tint";

type Path = "/app/activity" | "/app/plan" | "/app/subscriptions";

interface Tile {
	key: string;
	to: Path;
	tint: string;
	icon: ReactNode;
	label: string;
	value: string;
	sub: string;
	bar?: number;
}

/** Three numbers worth a glance (today, the month, bills still due), each one tap from its page. */
export function StatTiles({
	summary,
	goals,
}: {
	summary: Summary;
	goals: Goal[];
}) {
	const reduce = useReducedMotion();
	const cur = summary.homeCurrency;
	const money = (m: number) => formatMinor(m, cur);
	const todayMinor = summary.today.reduce((s, x) => s + x.homeAmountMinor, 0);
	const left = summary.safe.leftThisMonthMinor;
	const goal = goals.find((g) => g.savedMinor < g.targetMinor);
	const badge = (tint: string, children: ReactNode) => (
		<span
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-full bg-linear-to-br text-white shadow-sm",
				tint,
			)}
			aria-hidden="true"
		>
			{children}
		</span>
	);

	const tiles: Tile[] = [
		{
			key: "today",
			to: "/app/activity",
			tint: TINTS.orange ?? "",
			icon: badge(TINTS.orange ?? "", <Receipt className="size-3.5" />),
			label: t("Spent today"),
			value: money(todayMinor),
			sub: t(summary.today.length === 1 ? "1 expense" : "{n} expenses", {
				n: summary.today.length,
			}),
		},
		{
			key: "left",
			to: "/app/plan",
			tint: TINTS.lime ?? "",
			icon: badge(TINTS.lime ?? "", <Wallet className="size-3.5" />),
			label: left < 0 ? t("Over this month") : t("Left this month"),
			value: money(Math.abs(left)),
			sub: t(summary.daysLeft === 1 ? "1 day to go" : "{n} days to go", {
				n: summary.daysLeft,
			}),
		},
		summary.bills.items.length > 0 || !goal
			? {
					key: "bills",
					to: "/app/subscriptions",
					tint: TINTS.amber ?? "",
					icon: badge(
						TINTS.amber ?? "",
						<CalendarClock className="size-3.5" />,
					),
					label: t("Bills still due"),
					value: money(summary.bills.minor),
					sub: t(
						summary.bills.items.length === 1
							? "1 bill this month"
							: "{n} bills this month",
						{ n: summary.bills.items.length },
					),
				}
			: {
					key: "goal",
					to: "/app/plan",
					tint: goalTint(goal.id),
					icon: badge(goalTint(goal.id), <Target className="size-3.5" />),
					label: `${goal.emoji} ${goal.name}`,
					value: `${Math.round((goal.savedMinor / goal.targetMinor) * 100)}%`,
					sub: t("of {amount}", { amount: money(goal.targetMinor) }),
					bar: goal.savedMinor / goal.targetMinor,
				},
	];

	return (
		<ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
			{tiles.map((tile, i) => (
				<motion.li
					key={tile.key}
					className={cn(i === 2 && "max-sm:col-span-2")}
					initial={reduce ? false : { opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: reduce ? 0 : 0.08 + i * 0.06 }}
				>
					<Link
						to={tile.to}
						className="group relative flex h-full flex-col overflow-hidden rounded-panel border border-line bg-surface p-3 transition-transform hover:-translate-y-0.5 sm:p-4"
					>
						<span
							aria-hidden="true"
							className={cn(
								"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.17] dark:opacity-[0.13]",
								tile.tint,
							)}
						/>
						<span className="relative flex items-center gap-1.5">
							{tile.icon}
							<span className="min-w-0 text-[0.75rem] leading-tight font-semibold break-words text-ink-soft sm:text-[0.82rem]">
								{tile.label}
							</span>
						</span>
						<span
							data-money
							className="num relative mt-1.5 block text-[1.15rem] leading-tight font-extrabold break-words sm:text-[1.35rem]"
						>
							{tile.value}
						</span>
						{tile.bar !== undefined && (
							<span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink/10">
								<span
									className={cn(
										"block h-full rounded-full bg-linear-to-r",
										tile.tint,
									)}
									style={{ width: `${Math.min(1, tile.bar) * 100}%` }}
								/>
							</span>
						)}
						<span
							data-money
							className="relative mt-auto block pt-1 text-[0.72rem] leading-snug text-ink-soft sm:text-[0.8rem]"
						>
							{tile.sub}
						</span>
					</Link>
				</motion.li>
			))}
		</ul>
	);
}
