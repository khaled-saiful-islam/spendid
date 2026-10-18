import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

export type ConnectionMode = "offline" | "server" | "trying";

const COIN_S =
	"M40.5 23.5c-1.8-2.4-4.8-3.8-8.6-3.8-5 0-8.4 2.6-8.4 6.3 0 8.3 17.6 4.6 17.6 12.4 0 3.9-3.6 6.6-9 6.6-4.1 0-7.4-1.6-9.4-4.4";

/** One reach-and-miss of the plug, then a second try, then back. */
const REACH = {
	duration: 2.6,
	repeat: Number.POSITIVE_INFINITY,
	ease: "easeInOut",
} as const;
const REACH_TIMES = [0, 0.35, 0.5, 0.7, 1];

/**
 * The phone's cable and Spendid's cloud reaching for each other and just missing, with a
 * spark each time. Offline: a Wi-Fi-off badge on the phone. Server not answering: the cloud
 * dozes. Trying: the plug goes in and the line lights up. Still with reduced motion.
 */
export function ConnectionScene({ mode }: { mode: ConnectionMode }) {
	const reduce = useReducedMotion() ?? false;
	const id = useId();
	const cloud = `${id}-cloud`;
	const trying = mode === "trying";
	const loop = (keyframes: number[]) =>
		reduce ? { x: keyframes[1] ?? 0 } : { x: keyframes };

	return (
		<svg
			viewBox="0 0 320 150"
			className="mx-auto w-full max-w-[22rem]"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id={cloud} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#a78bfa" />
					<stop offset="100%" stopColor="#6366f1" />
				</linearGradient>
			</defs>

			{/* Spendid's side: cable into a socket, drawn under the cloud. */}
			<motion.g
				animate={trying ? { x: 0 } : loop([0, -6, 0, -6, 0])}
				transition={
					trying || reduce
						? { duration: 0.3 }
						: { ...REACH, times: REACH_TIMES }
				}
			>
				<path
					d="M268 70 C 262 104, 230 106, 196 106"
					className="fill-none stroke-plum-500"
					strokeWidth="4"
					strokeLinecap="round"
				/>
				<rect
					x="180"
					y="96"
					width="17"
					height="20"
					rx="4"
					className="fill-ink"
				/>
				<rect
					x="183"
					y="100"
					width="4"
					height="4"
					rx="1"
					className="fill-surface"
				/>
				<rect
					x="183"
					y="108"
					width="4"
					height="4"
					rx="1"
					className="fill-surface"
				/>
			</motion.g>

			{/* The phone's side: cable and plug, drawn under the phone. */}
			<motion.g
				animate={trying ? { x: 24 } : loop([0, 16, 2, 14, 0])}
				transition={
					trying || reduce
						? { type: "spring", stiffness: 260, damping: 18 }
						: { ...REACH, times: REACH_TIMES }
				}
			>
				<path
					d="M40 104 C 90 104, 100 106, 132 106"
					className="fill-none stroke-plum-500"
					strokeWidth="4"
					strokeLinecap="round"
				/>
				<rect
					x="130"
					y="97"
					width="18"
					height="18"
					rx="4"
					className="fill-ink"
				/>
				<rect
					x="148"
					y="100"
					width="9"
					height="4"
					rx="1.5"
					className="fill-plum-300"
				/>
				<rect
					x="148"
					y="108"
					width="9"
					height="4"
					rx="1.5"
					className="fill-plum-300"
				/>
			</motion.g>

			{/* Sparks where they almost meet. */}
			{!trying && !reduce && (
				<motion.g
					style={{ transformOrigin: "174px 106px" }}
					animate={{
						opacity: [0, 0, 1, 0, 0, 1, 0, 0],
						scale: [0.4, 0.4, 1.2, 0.6, 0.4, 1.2, 0.6, 0.4],
					}}
					transition={{
						...REACH,
						times: [0, 0.3, 0.35, 0.44, 0.65, 0.7, 0.79, 1],
					}}
					className="stroke-marigold"
					strokeWidth="3"
					strokeLinecap="round"
				>
					<path d="M174 92 L174 86" />
					<path d="M174 120 L174 126" />
					<path d="M164 98 L159 94" />
					<path d="M184 98 L189 94" />
					<path d="M164 114 L159 118" />
					<path d="M184 114 L189 118" />
				</motion.g>
			)}

			{/* Connected: a ring pulses out from the plug. */}
			{trying && !reduce && (
				<motion.circle
					cx="178"
					cy="106"
					className="fill-none stroke-jade"
					strokeWidth="3"
					initial={{ r: 8, opacity: 0.8 }}
					animate={{ r: 30, opacity: 0 }}
					transition={{
						duration: 1,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeOut",
					}}
				/>
			)}

			{/* The phone, with Spendid's coin on screen. */}
			<rect
				x="20"
				y="20"
				width="62"
				height="110"
				rx="13"
				className="fill-surface stroke-plum-300"
				strokeWidth="3"
			/>
			<rect
				x="41"
				y="119"
				width="20"
				height="3.5"
				rx="1.75"
				className="fill-plum-200"
			/>
			<motion.g
				animate={
					reduce ? undefined : trying ? { rotate: [0, 360] } : { y: [0, -4, 0] }
				}
				transition={
					trying
						? {
								duration: 1.1,
								repeat: Number.POSITIVE_INFINITY,
								ease: "linear",
							}
						: {
								duration: 2.2,
								repeat: Number.POSITIVE_INFINITY,
								ease: "easeInOut",
							}
				}
				style={{ transformOrigin: "51px 64px" }}
			>
				<circle cx="51" cy="64" r="17" className="fill-marigold" />
				<path
					d={COIN_S}
					transform="translate(34 47) scale(0.53)"
					fill="none"
					stroke="#2A1446"
					strokeWidth="5"
					strokeLinecap="round"
				/>
			</motion.g>

			{/* No connection on the phone itself. */}
			{mode === "offline" && (
				<motion.g
					style={{ transformOrigin: "80px 24px" }}
					animate={reduce ? undefined : { scale: [1, 1.12, 1] }}
					transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY }}
				>
					<circle cx="80" cy="24" r="13" className="fill-coral" />
					<path
						d="M73 22.5a10 10 0 0 1 14 0M76 26a5.5 5.5 0 0 1 8 0"
						fill="none"
						stroke="white"
						strokeWidth="2.2"
						strokeLinecap="round"
					/>
					<circle cx="80" cy="29.5" r="1.6" fill="white" />
					<path
						d="M73 17 L87 31"
						stroke="white"
						strokeWidth="2.4"
						strokeLinecap="round"
					/>
				</motion.g>
			)}

			{/* Spendid's cloud. */}
			<motion.g
				animate={reduce ? undefined : { y: [0, -3, 0] }}
				transition={{
					duration: 3,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			>
				<g fill={`url(#${cloud})`}>
					<circle cx="248" cy="62" r="17" />
					<circle cx="272" cy="50" r="22" />
					<circle cx="294" cy="64" r="15" />
					<rect x="232" y="58" width="76" height="22" rx="11" />
				</g>
				{[256, 272, 288].map((cx, i) => (
					<motion.circle
						key={cx}
						cx={cx}
						cy="66"
						r="3"
						fill="white"
						animate={
							reduce
								? undefined
								: {
										opacity: trying
											? [0.3, 1, 0.3]
											: mode === "server"
												? 0.35
												: [0.5, 1, 0.5],
									}
						}
						transition={{
							duration: 0.9,
							delay: i * 0.18,
							repeat: Number.POSITIVE_INFINITY,
						}}
					/>
				))}
			</motion.g>

			{/* Not answering: the cloud dozes. */}
			{mode === "server" &&
				!reduce &&
				[0, 1, 2].map((i) => (
					<motion.text
						key={i}
						x={282 + i * 10}
						y={30 - i * 6}
						className="fill-plum-500 font-display font-bold"
						fontSize={11 + i * 3}
						initial={{ opacity: 0, y: 0 }}
						animate={{ opacity: [0, 1, 0], y: [0, -14] }}
						transition={{
							duration: 2.4,
							delay: i * 0.6,
							repeat: Number.POSITIVE_INFINITY,
						}}
					>
						z
					</motion.text>
				))}
		</svg>
	);
}
