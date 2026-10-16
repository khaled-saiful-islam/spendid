import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

export type PipMood = "shining" | "calm" | "worried" | "curled" | "sleepy";

const SKIN = "#f6c48e";
const SKIN_DARK = "#e5a066";
const INK = "#2a1446";

/** Overlapping leaf-shaped scales in offset rows, like a real pangolin's back. */
function Scales({
	clip,
	rows,
	from,
	to,
}: {
	clip: string;
	rows: number[];
	from: number;
	to: number;
}) {
	return (
		<g clipPath={`url(#${clip})`}>
			{rows.map((y, r) =>
				Array.from({ length: Math.ceil((to - from) / 12) + 1 }, (_, i) => {
					const x = from + i * 12 + (r % 2 ? 6 : 0);
					return (
						<path
							key={`${y}-${x}`}
							d={`M${x - 7} ${y} Q${x} ${y + 14} ${x + 7} ${y} Q${x} ${y + 4} ${x - 7} ${y} Z`}
							fill={r % 2 ? "var(--color-marigold)" : "#ffc24d"}
							stroke={INK}
							strokeOpacity="0.22"
							strokeWidth="1.2"
						/>
					);
				}),
			)}
		</g>
	);
}

function Eye({ mood, blink }: { mood: PipMood; blink: boolean }) {
	if (mood === "shining")
		return (
			<path
				d="M101.5 63 Q105.5 57.5 109.5 63"
				fill="none"
				stroke={INK}
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
		);
	if (mood === "sleepy" || mood === "curled")
		return (
			<path
				d="M101.5 61 Q105.5 65.5 109.5 61"
				fill="none"
				stroke={INK}
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
		);
	return (
		<g>
			<motion.ellipse
				cx="105.5"
				cy="61.5"
				rx="2.8"
				animate={{ ry: blink ? 0.3 : 3 }}
				transition={{ duration: 0.08 }}
				fill={INK}
			/>
			{!blink && <circle cx="106.4" cy="60.4" r="0.9" fill="white" />}
			{mood === "worried" && (
				<path
					d="M100.5 55.5 L109 57.5"
					stroke={INK}
					strokeWidth="1.8"
					strokeLinecap="round"
				/>
			)}
		</g>
	);
}

function Sparkle({
	x,
	y,
	delay,
	size = 6,
}: {
	x: number;
	y: number;
	delay: number;
	size?: number;
}) {
	return (
		<motion.path
			d={`M${x} ${y - size} L${x + size * 0.28} ${y - size * 0.28} L${x + size} ${y} L${x + size * 0.28} ${y + size * 0.28} L${x} ${y + size} L${x - size * 0.28} ${y + size * 0.28} L${x - size} ${y} L${x - size * 0.28} ${y - size * 0.28} Z`}
			fill="#fff3c4"
			stroke="var(--color-marigold-deep)"
			strokeWidth="0.8"
			initial={{ scale: 0, opacity: 0 }}
			animate={{ scale: [0, 1, 0], opacity: [0, 1, 0], rotate: [0, 45, 90] }}
			transition={{
				repeat: Number.POSITIVE_INFINITY,
				duration: 2.2,
				delay,
				repeatDelay: 0.6,
			}}
			style={{ transformOrigin: `${x}px ${y}px` }}
		/>
	);
}

/**
 * Pip the pangolin. Pip's mood is today's money: shining while there's plenty left,
 * calm when on track, worried when it's nearly gone, curled up when over, sleepy at night.
 * `bounce` changes (e.g. a new expense) make Pip hop.
 */
export function Pip({
	mood,
	bounce = 0,
	className,
}: {
	mood: PipMood;
	bounce?: number;
	className?: string;
}) {
	const reduce = useReducedMotion();
	const id = useId().replace(/[^\w-]/g, "");
	const [blink, setBlink] = useState(false);

	useEffect(() => {
		if (reduce || mood === "sleepy" || mood === "curled" || mood === "shining")
			return;
		const t = setInterval(() => {
			setBlink(true);
			setTimeout(() => setBlink(false), 140);
		}, 3800);
		return () => clearInterval(t);
	}, [reduce, mood]);

	const curled = mood === "curled";
	return (
		<motion.svg
			viewBox="0 0 140 110"
			className={cn("overflow-visible", className)}
			role="img"
			aria-label={t("Pip the pangolin, {mood}", {
				mood: t(mood === "curled" ? "curled up" : mood),
			})}
			key={bounce}
			initial={reduce || bounce === 0 ? false : { y: 0 }}
			animate={reduce || bounce === 0 ? undefined : { y: [0, -14, 0, -5, 0] }}
			transition={{ duration: 0.7, ease: "easeOut" }}
		>
			<defs>
				<clipPath id={`body-${id}`}>
					{curled ? (
						<circle cx="66" cy="66" r="31" />
					) : (
						<ellipse cx="64" cy="61" rx="37" ry="27" />
					)}
				</clipPath>
			</defs>
			<ellipse
				cx="68"
				cy="101"
				rx={curled ? 30 : 44}
				ry="5"
				fill={INK}
				opacity="0.1"
			/>

			<AnimatePresence mode="wait">
				{curled ? (
					<motion.g
						key="curled"
						initial={{ scale: 0.7, rotate: -40 }}
						animate={{ scale: 1, rotate: 0 }}
						exit={{ scale: 0.7 }}
						style={{ transformOrigin: "66px 66px" }}
					>
						<motion.g
							animate={reduce ? undefined : { rotate: [-3, 3, -3] }}
							transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.6 }}
							style={{ transformOrigin: "66px 90px" }}
						>
							<circle
								cx="66"
								cy="66"
								r="31"
								fill="var(--color-marigold-deep)"
							/>
							<Scales
								clip={`body-${id}`}
								rows={[34, 43, 52, 61, 70, 79, 88]}
								from={34}
								to={100}
							/>
							<path
								d="M40 84 Q50 100 72 98 Q92 96 96 82"
								fill="none"
								stroke="var(--color-marigold-deep)"
								strokeWidth="9"
								strokeLinecap="round"
							/>
							<ellipse cx="84" cy="88" rx="10" ry="7" fill={SKIN} />
							<path
								d="M80 87 Q83.5 90 87 87"
								fill="none"
								stroke={INK}
								strokeWidth="2"
								strokeLinecap="round"
							/>
							<circle cx="94" cy="90" r="1.6" fill={INK} />
						</motion.g>
					</motion.g>
				) : (
					<motion.g
						key="walking"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					>
						{/* Tail */}
						<motion.path
							d="M34 56 C16 58 6 74 12 88 C16 97 30 96 31 87 C26 89 21 85 23 78 C26 68 35 66 45 66 Z"
							fill="var(--color-marigold-deep)"
							stroke={INK}
							strokeOpacity="0.2"
							animate={reduce ? undefined : { rotate: [0, -6, 0] }}
							transition={{
								repeat: Number.POSITIVE_INFINITY,
								duration: mood === "shining" ? 0.9 : 2.4,
								ease: "easeInOut",
							}}
							style={{ transformOrigin: "40px 62px" }}
						/>
						{/* Legs */}
						<rect
							x="40"
							y="76"
							width="11"
							height="17"
							rx="5.5"
							fill={SKIN_DARK}
						/>
						<rect
							x="78"
							y="76"
							width="11"
							height="17"
							rx="5.5"
							fill={SKIN_DARK}
						/>
						{/* Body breathes */}
						<motion.g
							animate={
								reduce
									? undefined
									: { scaleY: [1, mood === "sleepy" ? 1.05 : 1.025, 1] }
							}
							transition={{
								repeat: Number.POSITIVE_INFINITY,
								duration: mood === "sleepy" ? 3.4 : 2.2,
								ease: "easeInOut",
							}}
							style={{ transformOrigin: "64px 88px" }}
						>
							<ellipse
								cx="64"
								cy="61"
								rx="37"
								ry="27"
								fill="var(--color-marigold-deep)"
							/>
							<Scales
								clip={`body-${id}`}
								rows={[30, 39, 48, 57, 66, 75, 84]}
								from={24}
								to={104}
							/>
						</motion.g>
						{/* Head and snout */}
						<g>
							<ellipse cx="103" cy="64" rx="15" ry="13" fill={SKIN} />
							<path d="M108 57 Q125 59 131 69 Q128 75 114 75 Z" fill={SKIN} />
							<circle cx="130.5" cy="69.5" r="2.2" fill={INK} />
							<ellipse cx="96" cy="53.5" rx="3.6" ry="2.6" fill={SKIN_DARK} />
							<Eye mood={mood} blink={blink} />
							{(mood === "shining" || mood === "calm") && (
								<circle
									cx="112"
									cy="69"
									r="3"
									fill="var(--color-coral)"
									opacity="0.45"
								/>
							)}
							{mood === "worried" && (
								<motion.path
									d="M118 50 Q121 55 118 58 Q115 55 118 50 Z"
									fill="var(--color-sky)"
									animate={
										reduce ? undefined : { y: [0, 4, 0], opacity: [1, 0.6, 1] }
									}
									transition={{
										repeat: Number.POSITIVE_INFINITY,
										duration: 1.6,
									}}
								/>
							)}
						</g>
						{mood === "shining" && !reduce && (
							<g>
								<Sparkle x={30} y={28} delay={0} />
								<Sparkle x={88} y={22} delay={0.7} size={5} />
								<Sparkle x={122} y={44} delay={1.4} size={4} />
							</g>
						)}
						{mood === "sleepy" && !reduce && (
							<motion.text
								x="116"
								y="44"
								fontSize="12"
								fontWeight="800"
								fill="var(--color-plum-500)"
								animate={{ y: [44, 30], opacity: [0, 1, 0] }}
								transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.4 }}
							>
								z
							</motion.text>
						)}
					</motion.g>
				)}
			</AnimatePresence>
		</motion.svg>
	);
}
