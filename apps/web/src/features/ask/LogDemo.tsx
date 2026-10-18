import { formatMinor } from "@spendid/shared";
import {
	Car,
	Check,
	Coffee,
	Fuel,
	type LucideIcon,
	ParkingMeter,
	Utensils,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { SpendidCoin } from "./SpendidCoin";

interface Line {
	name: string;
	minor: number;
	Icon: LucideIcon;
	tint: string;
}

interface Example {
	/** What a person types, as they'd really type it (Malay on purpose for one). */
	text: string;
	when: string;
	lines: Line[];
}

const EXAMPLES: Example[] = [
	{
		text: "Lunch 12 and grab 9 yesterday",
		when: "Yesterday",
		lines: [
			{ name: "Lunch", minor: 1200, Icon: Utensils, tint: "orange" },
			{ name: "Grab", minor: 900, Icon: Car, tint: "sky" },
		],
	},
	{
		text: "Teh tarik 3.50 pagi tadi",
		when: "Today",
		lines: [{ name: "Teh tarik", minor: 350, Icon: Coffee, tint: "amber" }],
	},
	{
		text: "Petrol 80 and parking 5 on Monday",
		when: "Monday",
		lines: [
			{ name: "Petrol", minor: 8000, Icon: Fuel, tint: "rose" },
			{ name: "Parking", minor: 500, Icon: ParkingMeter, tint: "blue" },
		],
	},
];

const TYPE_MS = 65;
/** Ticks after typing: the slip prints, then holds before the next example. */
const PRINT_TICKS = 10;
const HOLD_TICKS = 34;

/**
 * Logging, shown instead of told: a message types itself, the coin spins, and a little
 * receipt prints the expenses it understood. Cycles through English and Malay examples.
 * A showcase only: nothing to tap.
 */
export function LogDemo({ currency }: { currency: string }) {
	const reduce = useReducedMotion();
	const [index, setIndex] = useState(0);
	const [tick, setTick] = useState(0);
	const example = EXAMPLES[index] ?? EXAMPLES[0];
	const typed = example?.text.length ?? 0;

	useEffect(() => {
		if (reduce) return;
		const timer = setInterval(() => {
			setTick((n) => {
				if (n < typed + PRINT_TICKS + HOLD_TICKS) return n + 1;
				setIndex((i) => (i + 1) % EXAMPLES.length);
				return 0;
			});
		}, TYPE_MS);
		return () => clearInterval(timer);
	}, [reduce, typed]);

	if (!example) return null;
	const shownChars = reduce ? typed : Math.min(tick, typed);
	const typing = shownChars < typed;
	const printed = reduce ? Number.POSITIVE_INFINITY : tick - typed;
	const total = example.lines.reduce((s, l) => s + l.minor, 0);
	const money = (m: number) => formatMinor(m, currency);

	return (
		<figure className="relative grid w-full gap-4 overflow-hidden rounded-panel border border-line bg-surface p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,15rem)] sm:items-center">
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.18] dark:opacity-[0.14]",
					TINTS.teal,
				)}
			/>
			<figcaption className="sr-only">
				{t(
					"You can type expenses like a text message, in English or Malay, and Spendid turns them into expenses.",
				)}
			</figcaption>

			<span className="relative" aria-hidden="true">
				<span className="flex flex-wrap items-center gap-2 text-[0.82rem] font-semibold text-ink-soft">
					<span className="rounded-full bg-ink px-2 py-0.5 text-[0.72rem] font-bold tracking-wide text-bg">
						{t("Example")}
					</span>
					{t("Type it like a text")}
					<span className="rounded-full bg-surface/80 px-2 py-0.5 text-[0.72rem] ring-1 ring-line">
						EN · BM
					</span>
				</span>
				<span className="mt-2.5 flex items-end gap-2">
					<span className="min-h-[3.2rem] max-w-full rounded-[1.2rem] rounded-br-md border-2 border-dashed border-ink/25 bg-surface/80 px-3.5 py-2.5 text-[1rem] leading-snug font-medium text-ink">
						{example.text.slice(0, shownChars)}
						{typing && (
							<span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current" />
						)}
					</span>
				</span>
			</span>

			<span
				className="relative mx-auto rotate-90 sm:rotate-0"
				aria-hidden="true"
			>
				<SpendidCoin
					size="sm"
					state={
						typing ? "thinking" : printed < PRINT_TICKS ? "answering" : "idle"
					}
				/>
			</span>

			<span
				className="relative block min-h-[9.5rem] sm:min-h-[8.5rem]"
				aria-hidden="true"
			>
				<AnimatePresence mode="wait">
					{!typing && (
						<motion.span
							key={index}
							initial={reduce ? false : { opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 8 }}
							className="relative mx-auto block max-w-[17rem] -rotate-1 rounded-t-tile bg-surface px-4 pt-3 pb-4 shadow-lift"
						>
							<span className="block text-[0.72rem] font-semibold tracking-wide text-ink-soft">
								{t(example.when)}
							</span>
							<span className="mt-2 block space-y-2 border-t border-dashed border-line pt-2">
								{example.lines.map((line, i) =>
									printed > i * 3 ? (
										<motion.span
											key={line.name}
											initial={reduce ? false : { opacity: 0, x: -6 }}
											animate={{ opacity: 1, x: 0 }}
											className="flex items-center gap-2"
										>
											<span
												className={cn(
													"grid size-7 shrink-0 place-items-center rounded-full bg-linear-to-br text-white",
													TINTS[line.tint],
												)}
											>
												<line.Icon className="size-3.5" />
											</span>
											<span className="min-w-0 flex-1 text-[0.92rem] font-semibold break-words">
												{line.name}
											</span>
											<span className="num text-[0.92rem] font-semibold">
												{money(line.minor)}
											</span>
										</motion.span>
									) : null,
								)}
							</span>
							{printed > example.lines.length * 3 && (
								<motion.span
									initial={reduce ? false : { opacity: 0 }}
									animate={{ opacity: 1 }}
									className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2 text-[0.85rem]"
								>
									<span className="text-ink-soft">
										{t(
											example.lines.length === 1 ? "1 expense" : "{n} expenses",
											{ n: example.lines.length },
										)}
									</span>
									<span className="num font-bold">{money(total)}</span>
								</motion.span>
							)}
							{printed > example.lines.length * 3 + 2 && (
								<motion.span
									initial={
										reduce ? false : { opacity: 0, scale: 1.8, rotate: -24 }
									}
									animate={{ opacity: 1, scale: 1, rotate: -12 }}
									transition={{ type: "spring", stiffness: 380, damping: 14 }}
									className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-md border-2 border-safe bg-surface px-1.5 py-0.5 text-[0.72rem] font-extrabold tracking-wide text-safe uppercase"
								>
									<Check className="size-3" strokeWidth={3} />
									{t("Ready")}
								</motion.span>
							)}
							<svg
								aria-hidden="true"
								viewBox="0 0 120 6"
								preserveAspectRatio="none"
								className="absolute inset-x-0 -bottom-1.5 h-1.5 w-full text-surface"
							>
								<path
									d="M0 0 L5 6 L10 0 L15 6 L20 0 L25 6 L30 0 L35 6 L40 0 L45 6 L50 0 L55 6 L60 0 L65 6 L70 0 L75 6 L80 0 L85 6 L90 0 L95 6 L100 0 L105 6 L110 0 L115 6 L120 0 Z"
									fill="currentColor"
								/>
							</svg>
						</motion.span>
					)}
				</AnimatePresence>
			</span>
		</figure>
	);
}
