import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export type CoinState = "idle" | "thinking" | "answering";

const SIZES = { sm: "size-10", md: "size-12", lg: "size-16" } as const;

/**
 * The assistant's face is Spendid's own coin (the logo mark). It flips while it looks
 * through your money, bobs while it writes, and catches a shine now and then when idle.
 */
export function SpendidCoin({
	state = "idle",
	size = "sm",
	className,
}: {
	state?: CoinState;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const reduce = useReducedMotion();
	// SVG url() references need a plain id; React ids contain punctuation.
	const face = `coin${useId().replace(/[^\w-]/g, "")}`;
	// Always animate back to face-on, so a flip never freezes edge-on when thinking stops.
	const motionFor = reduce
		? undefined
		: state === "thinking"
			? {
					animate: { rotateY: [0, 360], y: 0 },
					transition: { repeat: Number.POSITIVE_INFINITY, duration: 1.1, ease: "easeInOut" as const },
				}
			: state === "answering"
				? {
						animate: { rotateY: 0, y: [0, -3, 0] },
						transition: { rotateY: { duration: 0.3 }, y: { repeat: Number.POSITIVE_INFINITY, duration: 0.8 } },
					}
				: { animate: { rotateY: 0, y: 0 }, transition: { duration: 0.4 } };
	return (
		<span
			aria-hidden="true"
			className={cn(
				"relative inline-grid shrink-0 [perspective:200px]",
				SIZES[size],
				className,
			)}
		>
			<motion.span
				className="relative block size-full [transform-style:preserve-3d]"
				{...motionFor}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 64 64"
					className="size-full drop-shadow-[0_6px_10px_rgb(245_147_0/0.45)]"
				>
					<defs>
						<radialGradient id={face} cx="35%" cy="30%" r="75%">
							<stop offset="0%" stopColor="#ffd27a" />
							<stop offset="60%" stopColor="var(--color-marigold)" />
							<stop offset="100%" stopColor="var(--color-marigold-deep)" />
						</radialGradient>
					</defs>
					<circle cx="32" cy="32" r="30" fill={`url(#${face})`} />
					<circle
						cx="32"
						cy="32"
						r="23"
						fill="none"
						stroke="#2A1446"
						strokeWidth="3"
						strokeDasharray="2 5"
						opacity=".35"
					/>
					<path
						d="M40.5 23.5c-1.8-2.4-4.8-3.8-8.6-3.8-5 0-8.4 2.6-8.4 6.3 0 8.3 17.6 4.6 17.6 12.4 0 3.9-3.6 6.6-9 6.6-4.1 0-7.4-1.6-9.4-4.4"
						fill="none"
						stroke="#2A1446"
						strokeWidth="5"
						strokeLinecap="round"
					/>
				</svg>
				{/* Shine sweep */}
				{!reduce && state !== "thinking" && (
					<span className="absolute inset-0 overflow-hidden rounded-full">
						<motion.span
							className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/55 blur-[2px]"
							animate={{ x: ["0%", "450%"] }}
							transition={{
								repeat: Number.POSITIVE_INFINITY,
								duration: 1.2,
								repeatDelay: 3.5,
								ease: "easeInOut",
							}}
						/>
					</span>
				)}
			</motion.span>
		</span>
	);
}
