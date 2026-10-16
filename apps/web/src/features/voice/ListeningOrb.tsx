import { Mic } from "lucide-react";
import {
	type MotionValue,
	motion,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import { cn } from "@/lib/cn";

interface ListeningOrbProps {
	loudness: MotionValue<number>;
	hearing: boolean;
	busy?: boolean;
	onClick?: () => void;
	label: string;
}

/** A marigold coin that breathes with your voice; rings turn jade once speech is heard. */
export function ListeningOrb({
	loudness,
	hearing,
	busy,
	onClick,
	label,
}: ListeningOrbProps) {
	const reduce = useReducedMotion();
	const smooth = useSpring(loudness, { stiffness: 260, damping: 22 });
	const inner = useTransform(smooth, (v) => 1 + v * 0.18);
	const ring1 = useTransform(smooth, (v) => 1.15 + v * 0.55);
	const ring2 = useTransform(smooth, (v) => 1.3 + v * 0.9);
	const ringClass = cn(
		"absolute inset-0 rounded-full border-4 transition-colors duration-300",
		hearing ? "border-jade/60" : "border-marigold/40",
	);

	return (
		<div className="relative mx-auto grid size-44 place-items-center">
			{!reduce && (
				<>
					<motion.span
						aria-hidden="true"
						className={ringClass}
						style={{ scale: ring2, opacity: 0.35 }}
					/>
					<motion.span
						aria-hidden="true"
						className={ringClass}
						style={{ scale: ring1, opacity: 0.6 }}
					/>
				</>
			)}
			{busy && !reduce && (
				<motion.span
					aria-hidden="true"
					className="absolute inset-[-10px] rounded-full border-4 border-transparent border-t-plum-500"
					animate={{ rotate: 360 }}
					transition={{
						repeat: Number.POSITIVE_INFINITY,
						duration: 1,
						ease: "linear",
					}}
				/>
			)}
			<motion.button
				type="button"
				onClick={onClick}
				aria-label={label}
				style={{ scale: reduce ? 1 : inner }}
				whileTap={{ scale: 0.92 }}
				className="relative grid size-36 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#FFD27A,#FFB224_60%,#F59300)] text-plum-900 shadow-coin"
			>
				<Mic className="size-14" strokeWidth={2.2} aria-hidden="true" />
			</motion.button>
		</div>
	);
}
