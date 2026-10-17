import type { PipFestive, PipGift } from "@spendid/shared";
import { motion, useReducedMotion } from "motion/react";

const INK = "#2a1446";

export interface Outfit {
	hat?: "leaf" | "explorer" | "crown" | "santa";
	scarf?: boolean;
	shades?: boolean;
	medal?: boolean;
	/** Something beside Pip for a celebration. */
	extra?: Exclude<PipFestive, "santa">;
}

/** What Pip wears: the gifts the person chose to show, plus any festive look. */
export function outfitFor(
	wearing: PipGift[],
	festive: PipFestive | null,
): Outfit {
	const hats = (["crown", "explorer", "leaf"] as const).filter((h) =>
		wearing.includes(h),
	);
	return {
		hat: festive === "santa" ? "santa" : hats[0],
		scarf: wearing.includes("scarf"),
		shades: wearing.includes("shades"),
		medal: wearing.includes("medal"),
		extra: festive && festive !== "santa" ? festive : undefined,
	};
}

/** Accessories drawn in Pip's own 140×110 space (head centre ≈ 103,64). */
export function PipOutfitLayer({ outfit }: { outfit: Outfit }) {
	const reduce = useReducedMotion();
	return (
		<g>
			{outfit.scarf && (
				<g>
					<path
						d="M87 60 Q95 72 92 84 L98 84 Q101 71 94 58 Z"
						fill="#7A4FC4"
						stroke={INK}
						strokeOpacity="0.25"
					/>
					<path d="M90 80 L86 94 L93 92 L96 82 Z" fill="#6b3fb5" />
					{[63, 69, 75, 81].map((y) => (
						<circle key={y} cx={92 + (y % 2)} cy={y} r="1.3" fill="#FFB224" />
					))}
				</g>
			)}
			{outfit.medal && (
				<g>
					<path
						d="M84 70 L88 84 M96 70 L92 84"
						stroke="#FF5C7A"
						strokeWidth="2.5"
					/>
					<circle
						cx="90"
						cy="88"
						r="5.5"
						fill="#FFB224"
						stroke={INK}
						strokeOpacity="0.4"
					/>
					<text
						x="90"
						y="91"
						fontSize="7"
						fontWeight="900"
						textAnchor="middle"
						fill={INK}
					>
						S
					</text>
				</g>
			)}
			{outfit.shades && (
				<g>
					<rect x="99.5" y="57.5" width="12" height="7" rx="3" fill={INK} />
					<path d="M99.5 60 L94 58.5" stroke={INK} strokeWidth="1.6" />
					<path
						d="M101.5 59.5 L104 59.5"
						stroke="white"
						strokeOpacity="0.6"
						strokeWidth="1.2"
						strokeLinecap="round"
					/>
				</g>
			)}
			{outfit.hat === "leaf" && (
				<motion.g
					animate={reduce ? undefined : { rotate: [-6, 6, -6] }}
					transition={{ repeat: Number.POSITIVE_INFINITY, duration: 3 }}
					style={{ transformOrigin: "101px 52px" }}
				>
					<path
						d="M101 52 Q100 46 101 43"
						stroke="#2f855a"
						strokeWidth="1.6"
						fill="none"
					/>
					<path
						d="M101 44 Q92 36 88 41 Q93 48 101 44 Z"
						fill="#12B886"
						stroke="#0b7a5a"
						strokeWidth="0.8"
					/>
				</motion.g>
			)}
			{outfit.hat === "explorer" && (
				<g>
					<ellipse cx="102" cy="52.5" rx="15" ry="3.4" fill="#c58a3a" />
					<path d="M93 52 Q94 40 102 40 Q111 40 111 52 Z" fill="#d9a050" />
					<rect x="93.5" y="48" width="17" height="2.6" fill="#7a4a1a" />
				</g>
			)}
			{outfit.hat === "crown" && (
				<path
					d="M93 52 L94 41 L98.5 47 L102 39 L105.5 47 L110 41 L111 52 Z"
					fill="#FFB224"
					stroke={INK}
					strokeOpacity="0.35"
				/>
			)}
			{outfit.hat === "santa" && (
				<g>
					<path
						d="M92 53 Q96 36 112 40 Q120 44 123 52 L113 50 Q108 47 92 53 Z"
						fill="#E11D48"
					/>
					<rect x="90.5" y="50.5" width="22" height="5" rx="2.5" fill="white" />
					<circle cx="123" cy="52" r="3" fill="white" />
				</g>
			)}
			{outfit.extra === "lamp" && (
				<g>
					<path d="M124 101 Q122 93 132 93 Q142 93 140 101 Z" fill="#c2410c" />
					<motion.path
						d="M132 92 Q129 86 132 80 Q135 86 132 92 Z"
						fill="#FFB224"
						animate={reduce ? undefined : { scaleY: [1, 1.15, 0.95, 1] }}
						transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.2 }}
						style={{ transformOrigin: "132px 92px" }}
					/>
				</g>
			)}
			{outfit.extra === "ketupat" && (
				<g>
					<path d="M18 22 L18 30" stroke="#a16207" strokeWidth="1.2" />
					<path
						d="M18 30 L26 38 L18 46 L10 38 Z"
						fill="#16a34a"
						stroke="#facc15"
						strokeWidth="1.2"
					/>
					<path
						d="M14 34 L22 42 M22 34 L14 42"
						stroke="#facc15"
						strokeWidth="1"
					/>
				</g>
			)}
			{outfit.extra === "lantern" && (
				<motion.g
					animate={reduce ? undefined : { rotate: [-5, 5, -5] }}
					transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.4 }}
					style={{ transformOrigin: "18px 18px" }}
				>
					<path d="M18 18 L18 26" stroke="#a16207" strokeWidth="1.2" />
					<ellipse cx="18" cy="36" rx="9" ry="10" fill="#dc2626" />
					<rect x="13" y="25" width="10" height="3" rx="1" fill="#FFB224" />
					<rect x="13" y="44" width="10" height="3" rx="1" fill="#FFB224" />
				</motion.g>
			)}
			{outfit.extra === "flag" && (
				<g>
					<path d="M56 34 L56 8" stroke="#64748b" strokeWidth="1.6" />
					{[0, 1, 2, 3, 4].map((i) => (
						<rect
							key={i}
							x="56"
							y={8 + i * 2.4}
							width="20"
							height="2.4"
							fill={i % 2 ? "white" : "#dc2626"}
						/>
					))}
					<rect x="56" y="8" width="9" height="7.2" fill="#1e3a8a" />
					<circle cx="60" cy="11.6" r="1.8" fill="#facc15" />
				</g>
			)}
		</g>
	);
}
