import { motion } from "motion/react";
import { cn } from "@/lib/cn";

interface SafeDialProps {
	remainingMinor: number;
	allowanceMinor: number;
	className?: string;
}

const R = 88;
const STROKE = 14;

/** Ring color tells the story before the number does. */
function tone(ratio: number): string {
	if (ratio > 0.35) return "var(--color-jade)";
	if (ratio > 0.1) return "var(--color-marigold)";
	return "var(--color-coral)";
}

/** The coin dial: how much of today's safe-to-spend is left. */
export function SafeDial({
	remainingMinor,
	allowanceMinor,
	className,
}: SafeDialProps) {
	const ratio =
		allowanceMinor > 0 ? Math.max(0, remainingMinor / allowanceMinor) : 0;
	const percent = Math.round(Math.min(ratio, 1) * 100);

	return (
		<div className={cn("relative aspect-square", className)}>
			<svg
				viewBox="0 0 200 200"
				className="size-full -rotate-90"
				aria-hidden="true"
			>
				<defs>
					<radialGradient id="coin-face" cx="35%" cy="30%" r="80%">
						<stop offset="0%" stopColor="#FFD27A" />
						<stop offset="60%" stopColor="#FFB224" />
						<stop offset="100%" stopColor="#F59300" />
					</radialGradient>
				</defs>
				<circle
					cx="100"
					cy="100"
					r={R}
					fill="none"
					stroke="var(--line)"
					strokeWidth={STROKE}
				/>
				<motion.circle
					cx="100"
					cy="100"
					r={R}
					fill="none"
					strokeWidth={STROKE}
					strokeLinecap="round"
					initial={{ pathLength: 0 }}
					animate={{ pathLength: Math.min(ratio, 1), stroke: tone(ratio) }}
					transition={{ type: "spring", stiffness: 70, damping: 16 }}
				/>
				<circle cx="100" cy="100" r={R - 22} fill="url(#coin-face)" />
				<circle
					cx="100"
					cy="100"
					r={R - 31}
					fill="none"
					stroke="#2A1446"
					strokeOpacity=".22"
					strokeWidth="3"
					strokeDasharray="2 6"
				/>
			</svg>
			<div className="absolute inset-0 grid place-content-center text-center text-plum-900">
				<span className="num text-[clamp(2.2rem,9vw,3.1rem)] font-extrabold leading-none">
					{percent}%
				</span>
				<span className="mt-1 text-[0.8rem] font-semibold">of today left</span>
			</div>
			<span className="sr-only">
				{percent} percent of today's safe-to-spend amount is left.
			</span>
		</div>
	);
}
