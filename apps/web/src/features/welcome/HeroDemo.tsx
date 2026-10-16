import { formatMinor } from "@spendid/shared";
import { RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SafeDial } from "@/components/money/SafeDial";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

export const DEMO_CURRENCY = "MYR";
export const DEMO_LOCALE = "en-MY";
export const DEMO_ALLOWANCE = 6000;

export interface DemoSpend {
	id: string;
	label: string;
	minor: number;
	emoji: string;
	tint: string;
}

const BREAKFAST: DemoSpend = {
	id: "breakfast",
	label: t("Nasi lemak"),
	minor: 1180,
	emoji: "🍳",
	tint: "from-orange-300 to-pink-400",
};

const CHOICES: DemoSpend[] = [
	{
		id: "lunch",
		label: t("Lunch"),
		minor: 1200,
		emoji: "🍜",
		tint: "from-orange-300 to-rose-400",
	},
	{
		id: "grab",
		label: t("Grab ride"),
		minor: 950,
		emoji: "🚗",
		tint: "from-sky-300 to-indigo-400",
	},
	{
		id: "teh",
		label: t("Teh tarik"),
		minor: 380,
		emoji: "🧋",
		tint: "from-amber-200 to-orange-400",
	},
];

export function useDemoSpending() {
	const [logged, setLogged] = useState<DemoSpend[]>([BREAKFAST]);
	const spent = logged.reduce((sum, s) => sum + s.minor, 0);
	return {
		logged,
		remaining: DEMO_ALLOWANCE - spent,
		log: (s: DemoSpend) => setLogged((prev) => [s, ...prev]),
		reset: () => setLogged([BREAKFAST]),
	};
}

interface HeroDemoProps {
	demo: ReturnType<typeof useDemoSpending>;
}

/** Try-it panel: tap a spend, watch the dial and the headline number react. */
export function HeroDemo({ demo }: HeroDemoProps) {
	const remainingChoices = CHOICES.filter(
		(c) => !demo.logged.some((l) => l.id === c.id),
	);

	return (
		<div className="rounded-panel border border-line bg-surface p-5 shadow-lift sm:p-6">
			<SafeDial
				remainingMinor={demo.remaining}
				allowanceMinor={DEMO_ALLOWANCE}
				className="mx-auto w-[min(15rem,70vw)]"
			/>

			<p className="mt-5 text-center text-[0.95rem] text-ink-soft">
				{remainingChoices.length > 0
					? t("Tap something you bought today")
					: t("Nicely done. Still safe.")}
			</p>
			<div className="mt-3 flex min-h-12 flex-wrap justify-center gap-2">
				<AnimatePresence mode="popLayout">
					{remainingChoices.map((c) => (
						<motion.button
							key={c.id}
							type="button"
							layout
							exit={{ scale: 0.6, opacity: 0 }}
							whileTap={{ scale: 0.92 }}
							onClick={() => demo.log(c)}
							className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-bg px-4 font-medium hover:border-plum-300"
						>
							<span aria-hidden="true">{c.emoji}</span>
							{c.label} {formatMinor(c.minor, DEMO_CURRENCY, DEMO_LOCALE)}
						</motion.button>
					))}
					{remainingChoices.length === 0 && (
						<motion.button
							key="reset"
							type="button"
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							onClick={demo.reset}
							className="inline-flex h-11 items-center gap-2 rounded-full px-4 font-medium text-ink-soft hover:text-ink"
						>
							<RotateCcw className="size-4" aria-hidden="true" />{" "}
							{t("Start over")}
						</motion.button>
					)}
				</AnimatePresence>
			</div>

			<ul className="mt-5 space-y-2" aria-label={t("Logged today")}>
				<AnimatePresence initial={false}>
					{demo.logged.map((s) => (
						<motion.li
							key={s.id}
							layout
							initial={{ opacity: 0, y: -14, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							transition={{ type: "spring", stiffness: 380, damping: 28 }}
							className="flex items-center gap-3 rounded-tile bg-bg px-3 py-2.5"
						>
							<span
								className={cn(
									"grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br text-lg",
									s.tint,
								)}
								aria-hidden="true"
							>
								{s.emoji}
							</span>
							<span className="flex-1 font-medium">{s.label}</span>
							<span className="num font-semibold">
								{formatMinor(-s.minor, DEMO_CURRENCY, DEMO_LOCALE)}
							</span>
						</motion.li>
					))}
				</AnimatePresence>
			</ul>
		</div>
	);
}
