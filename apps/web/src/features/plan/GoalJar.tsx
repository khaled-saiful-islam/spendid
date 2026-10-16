import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

interface GoalJarProps {
	ratio: number;
	emoji: string;
	className?: string;
}

/** A glass jar whose liquid rises with progress; the surface gently waves. */
export function GoalJar({ ratio, emoji, className }: GoalJarProps) {
	const clip = useId();
	const reduce = useReducedMotion();
	const level = Math.min(1, Math.max(0, ratio));
	// Jar interior spans y=34..118 in the viewBox.
	const top = 118 - level * 84;

	return (
		<svg viewBox="0 0 100 124" className={className} aria-hidden="true">
			<defs>
				<clipPath id={clip}>
					<path d="M22 34 h56 a8 8 0 0 1 8 8 v66 a12 12 0 0 1 -12 12 h-48 a12 12 0 0 1 -12 -12 v-66 a8 8 0 0 1 8 -8z" />
				</clipPath>
			</defs>
			<rect
				x="30"
				y="16"
				width="40"
				height="14"
				rx="5"
				fill="var(--color-plum-300)"
			/>
			<path
				d="M22 34 h56 a8 8 0 0 1 8 8 v66 a12 12 0 0 1 -12 12 h-48 a12 12 0 0 1 -12 -12 v-66 a8 8 0 0 1 8 -8z"
				fill="var(--surface-2)"
			/>
			<g clipPath={`url(#${clip})`}>
				<motion.g
					initial={{ y: 84 }}
					animate={{ y: top - 34 }}
					transition={{ type: "spring", stiffness: 50, damping: 14 }}
				>
					<motion.path
						d="M-40 34 q15 -7 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v100 h-180z"
						fill="var(--color-marigold)"
						animate={reduce ? undefined : { x: [0, -60] }}
						transition={{
							repeat: Number.POSITIVE_INFINITY,
							duration: 3,
							ease: "linear",
						}}
					/>
				</motion.g>
			</g>
			<path
				d="M22 34 h56 a8 8 0 0 1 8 8 v66 a12 12 0 0 1 -12 12 h-48 a12 12 0 0 1 -12 -12 v-66 a8 8 0 0 1 8 -8z"
				fill="none"
				stroke="var(--color-plum-300)"
				strokeWidth="3"
			/>
			<path
				d="M30 46 v40"
				stroke="white"
				strokeOpacity=".5"
				strokeWidth="4"
				strokeLinecap="round"
			/>
			<text x="50" y="84" textAnchor="middle" fontSize="26">
				{emoji}
			</text>
		</svg>
	);
}
