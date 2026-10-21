import {
	BarChart3,
	Calculator,
	CalendarClock,
	Check,
	ClipboardCheck,
	Search,
	Sparkles,
	Target,
	Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

const ICONS: [RegExp, ReactNode][] = [
	[/adding up/i, <Calculator key="c" className="size-3.5" />],
	[/looking through/i, <Search key="s" className="size-3.5" />],
	[/budget/i, <Wallet key="w" className="size-3.5" />],
	[/bills/i, <CalendarClock key="d" className="size-3.5" />],
	[/goals/i, <Target key="t" className="size-3.5" />],
	[/chart/i, <BarChart3 key="b" className="size-3.5" />],
	[/cards/i, <ClipboardCheck key="k" className="size-3.5" />],
];
const iconFor = (label: string) =>
	ICONS.find(([re]) => re.test(label))?.[1] ?? (
		<Sparkles className="size-3.5" />
	);

/** What the assistant is doing, as a little timeline: done steps get a tick, the current one glows. */
export function ThinkingTrail({
	steps,
	live,
}: {
	steps: string[];
	live: boolean;
}) {
	if (!steps.length && !live) return null;
	// Each step once, also for chats saved before steps were de-duplicated.
	const unique = [...new Set(steps)];
	const shown = unique.length ? unique : ["Thinking…"];
	return (
		<ol className="mb-3 space-y-2" aria-live="polite">
			{shown.map((s, i) => {
				const current = live && i === shown.length - 1;
				return (
					<motion.li
						// biome-ignore lint/suspicious/noArrayIndexKey: the same step can run twice; order is stable
						key={`${s}-${i}`}
						initial={{ opacity: 0, x: -8 }}
						animate={{ opacity: 1, x: 0 }}
						className="flex items-center gap-2.5 text-[0.88rem]"
					>
						<span
							className={cn(
								"relative grid size-6 shrink-0 place-items-center rounded-full",
								current
									? "bg-plum-500 text-white dark:text-plum-950"
									: "bg-jade/15 text-safe",
							)}
							aria-hidden="true"
						>
							{current && (
								<span className="absolute inset-0 animate-ping rounded-full bg-plum-500/50 motion-reduce:hidden" />
							)}
							{current ? (
								iconFor(s)
							) : (
								<Check className="size-3.5" strokeWidth={3} />
							)}
						</span>
						<span
							className={current ? "font-semibold text-ink" : "text-ink-soft"}
						>
							{t(s).replace(/…$/, current ? "…" : "")}
						</span>
					</motion.li>
				);
			})}
		</ol>
	);
}
