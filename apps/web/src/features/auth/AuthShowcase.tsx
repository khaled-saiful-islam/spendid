import { Bus, Coffee, ShoppingBasket, Utensils } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { CountUp } from "@/components/money/CountUp";
import { SafeDial } from "@/components/money/SafeDial";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

const DAY_MINOR = 6000;

/** A small, believable day: each purchase comes off today's amount as it happens. */
const DAY = [
	{ name: "Teh tarik", minor: 350, Icon: Coffee, tint: "amber" },
	{ name: "Grab to work", minor: 900, Icon: Bus, tint: "sky" },
	{ name: "Nasi lemak", minor: 850, Icon: Utensils, tint: "orange" },
	{ name: "Groceries", minor: 1480, Icon: ShoppingBasket, tint: "lime" },
] as const;

const STEP_MS = 2300;

/**
 * Spendid working, before you've signed in: today's safe-to-spend and the coin dial react
 * as a day's purchases come in, then a new day starts. Still with reduced motion.
 */
export function AuthShowcase({
	large = false,
	name,
}: {
	large?: boolean;
	/** Who is signing up or in, as they type: the demo speaks to them. */
	name?: string;
}) {
	const reduce = useReducedMotion();
	const [step, setStep] = useState(reduce ? 2 : 0);

	useEffect(() => {
		if (reduce) return;
		const timer = setInterval(
			() => setStep((s) => (s + 1) % (DAY.length + 2)),
			STEP_MS,
		);
		return () => clearInterval(timer);
	}, [reduce]);

	const logged = DAY.slice(0, Math.min(step, DAY.length));
	const remaining =
		DAY_MINOR - logged.reduce((sum, item) => sum + item.minor, 0);

	return (
		<div aria-hidden="true" className={cn("w-full", large ? "max-w-sm" : "")}>
			<div className="flex items-center gap-4">
				<div className="min-w-0 flex-1">
					<p className="text-[0.85rem] font-medium text-plum-200">
						{name
							? t("{name}, today you can spend", { name })
							: t("Safe to spend today")}
					</p>
					<CountUp
						minor={remaining}
						from={DAY_MINOR}
						currency="MYR"
						locale="en-MY"
						className={cn(
							"num block leading-tight font-extrabold text-marigold",
							large ? "text-[3rem]" : "text-[2.1rem]",
						)}
					/>
				</div>
				<SafeDial
					remainingMinor={remaining}
					allowanceMinor={DAY_MINOR}
					compact
					className={cn("shrink-0", large ? "w-32" : "w-[5.25rem]")}
				/>
			</div>
			<ul
				className={cn(
					"relative mt-4 space-y-2 overflow-hidden",
					large ? "h-[13rem]" : "h-[6.9rem]",
				)}
			>
				<AnimatePresence initial={false}>
					{[...logged]
						.reverse()
						.slice(0, large ? 4 : 2)
						.map((item) => (
							<motion.li
								key={item.name}
								layout
								initial={{ opacity: 0, y: -16, scale: 0.96 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0 }}
								transition={{ type: "spring", stiffness: 380, damping: 30 }}
								className="flex items-center gap-3 rounded-tile bg-white/10 px-3 py-2 ring-1 ring-white/10"
							>
								<span
									className={cn(
										"grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br text-white",
										TINTS[item.tint],
									)}
								>
									<item.Icon className="size-4" />
								</span>
								<span className="min-w-0 flex-1 font-semibold break-words">
									{item.name}
								</span>
								<span className="num font-semibold text-plum-100">
									−RM {(item.minor / 100).toFixed(2)}
								</span>
							</motion.li>
						))}
				</AnimatePresence>
				{logged.length === 0 && (
					<motion.li
						key="new-day"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						className="rounded-tile border border-dashed border-white/25 px-3 py-2 text-[0.9rem] text-plum-200"
					>
						{t("A new day. Spend something and watch the number.")}
					</motion.li>
				)}
			</ul>
		</div>
	);
}
