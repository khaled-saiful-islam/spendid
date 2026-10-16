import { Keyboard, Mic, Plus, ScanLine } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { capture } from "../capture/capture-store";

/** The three ways to add, shown in turn so the button says what it does. */
const MODES = [
	{ icon: Plus, label: t("Add spending") },
	{ icon: Mic, label: t("Say it") },
	{ icon: ScanLine, label: t("Snap it") },
	{ icon: Keyboard, label: t("Type it") },
] as const;

const CYCLE_MS = 2600;

function useCycle(enabled: boolean): number {
	const [index, setIndex] = useState(0);
	useEffect(() => {
		if (!enabled) return;
		const t = setInterval(
			() => setIndex((i) => (i + 1) % MODES.length),
			CYCLE_MS,
		);
		return () => clearInterval(t);
	}, [enabled]);
	return enabled ? index : 0;
}

/** Light sweeping across the coin every few seconds. */
function Shine() {
	return (
		<motion.span
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-linear-to-r from-transparent via-white/70 to-transparent"
			animate={{ left: ["-50%", "150%"] }}
			transition={{
				duration: 1.1,
				repeat: Number.POSITIVE_INFINITY,
				repeatDelay: 3.2,
				ease: "easeInOut",
			}}
		/>
	);
}

/** The coin's dashed rim (Pip's scales), turning slowly. */
function Rim({ className }: { className?: string }) {
	return (
		<motion.svg
			viewBox="0 0 100 100"
			aria-hidden="true"
			className={cn("pointer-events-none absolute", className)}
			animate={{ rotate: 360 }}
			transition={{
				duration: 14,
				repeat: Number.POSITIVE_INFINITY,
				ease: "linear",
			}}
		>
			<circle
				cx="50"
				cy="50"
				r="46"
				fill="none"
				stroke="#2A1446"
				strokeOpacity=".28"
				strokeWidth="3"
				strokeDasharray="3 7"
				strokeLinecap="round"
			/>
		</motion.svg>
	);
}

/** Phone: a big glowing coin in the tab bar. Desktop: a wide coin-pill in the sidebar. */
export function AddButton({ wide }: { wide?: boolean }) {
	const reduce = useReducedMotion() ?? false;
	const index = useCycle(!reduce);
	const mode = MODES[index] ?? MODES[0];
	const Icon = mode.icon;

	const swap = {
		initial: { rotateX: -90, opacity: 0 },
		animate: { rotateX: 0, opacity: 1 },
		exit: { rotateX: 90, opacity: 0 },
		transition: { type: "spring", stiffness: 380, damping: 26 },
	} as const;

	if (wide) {
		return (
			<motion.button
				type="button"
				onClick={capture.openMenu}
				whileHover={{ scale: 1.03, y: -1 }}
				whileTap={{ scale: 0.94, rotate: -2 }}
				aria-label={t("Add spending")}
				className="relative flex h-13 w-full items-center gap-3 overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_25%,#FFD27A,#FFB224_55%,#F59300)] pr-5 pl-1.5 font-semibold text-plum-900 shadow-coin"
			>
				<span
					className="relative grid size-10 shrink-0 place-items-center rounded-full bg-plum-900 text-marigold"
					style={{ perspective: 400 }}
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={mode.label}
							{...swap}
							className="grid place-items-center"
						>
							<Icon className="size-5" strokeWidth={2.5} aria-hidden="true" />
						</motion.span>
					</AnimatePresence>
				</span>
				<span
					className="relative h-6 flex-1 overflow-hidden text-left"
					style={{ perspective: 400 }}
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={mode.label}
							{...swap}
							className="absolute inset-0 leading-6"
						>
							{mode.label}
						</motion.span>
					</AnimatePresence>
				</span>
				{!reduce && <Shine />}
			</motion.button>
		);
	}

	return (
		<motion.button
			type="button"
			onClick={capture.openMenu}
			whileTap={{ scale: 0.86, rotateY: 180 }}
			whileHover={{ scale: 1.06 }}
			transition={{ type: "spring", stiffness: 420, damping: 18 }}
			aria-label={t("Add spending: say it, snap it or type it")}
			className="relative grid size-16 -translate-y-4 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_32%_28%,#FFD27A,#FFB224_58%,#F59300)] text-plum-900 shadow-coin"
			style={{ perspective: 400 }}
		>
			{!reduce && <Rim className="inset-0.5" />}
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={mode.label}
					{...swap}
					className="grid place-items-center"
				>
					<Icon
						className={mode.icon === Plus ? "size-8" : "size-7"}
						strokeWidth={2.5}
						aria-hidden="true"
					/>
				</motion.span>
			</AnimatePresence>
			{!reduce && <Shine />}
		</motion.button>
	);
}
