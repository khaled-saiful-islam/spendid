import { formatMinor, type Summary } from "@spendid/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { TINTS } from "@/components/money/CategoryIcon";
import { cn } from "@/lib/cn";
import { useCategoryMap } from "../money/TransactionRow";

/** This month at a glance: one bar split by category, biggest first. */
export function MonthCard({ summary }: { summary: Summary }) {
	const categories = useCategoryMap();
	const total = summary.monthSpentMinor;
	const top = [...summary.byCategory]
		.sort((a, b) => b.spentMinor - a.spentMinor)
		.slice(0, 5);
	const scale = Math.max(total, summary.incomeMinor ?? 0, 1);

	return (
		<section
			aria-labelledby="month-title"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<div className="flex items-center justify-between gap-3">
				<h2 id="month-title" className="text-[1.4rem] font-bold">
					This month
				</h2>
				<Link
					to="/app/plan"
					className="inline-flex items-center gap-1 font-medium text-ink-soft hover:text-ink"
				>
					Your plan <ChevronRight className="size-4" aria-hidden="true" />
				</Link>
			</div>
			<p className="mt-1 text-ink-soft">
				<span className="num font-bold text-ink">
					{formatMinor(total, summary.homeCurrency)}
				</span>{" "}
				spent
				{summary.incomeMinor !== null && (
					<>
						{" "}
						of {formatMinor(summary.incomeMinor, summary.homeCurrency)} income
					</>
				)}
			</p>
			<div
				className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-surface-2"
				aria-hidden="true"
			>
				{top.map((c, i) => (
					<motion.span
						key={c.categoryId}
						className={cn(
							"h-full bg-linear-to-r",
							TINTS[categories.get(c.categoryId)?.tint ?? "slate"],
						)}
						initial={{ width: 0 }}
						animate={{ width: `${(c.spentMinor / scale) * 100}%` }}
						transition={{
							delay: 0.1 + i * 0.08,
							type: "spring",
							stiffness: 90,
							damping: 18,
						}}
					/>
				))}
			</div>
			<ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
				{top.map((c) => {
					const cat = categories.get(c.categoryId);
					return (
						<li
							key={c.categoryId}
							className="flex items-center justify-between gap-3 text-[0.95rem]"
						>
							<span className="inline-flex min-w-0 items-center gap-2">
								<span
									className={cn(
										"size-2.5 shrink-0 rounded-full bg-linear-to-r",
										TINTS[cat?.tint ?? "slate"],
									)}
									aria-hidden="true"
								/>
								<span className="break-words">{cat?.name ?? "Other"}</span>
							</span>
							<span className="num shrink-0 font-semibold">
								{formatMinor(c.spentMinor, summary.homeCurrency)}
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
