import { Keyboard, Mic, ScanLine, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

interface AddSheetProps {
	open: boolean;
	onClose: () => void;
}

const MODES = [
	{
		icon: Mic,
		title: "Say it",
		hint: "Talk naturally, even several things at once",
		ready: "M3",
	},
	{
		icon: ScanLine,
		title: "Scan a receipt",
		hint: "Point your camera, it captures by itself",
		ready: "M4",
	},
	{
		icon: Keyboard,
		title: "Type it",
		hint: "Shorthand like “coffee 6.50” is fine",
		ready: "M2",
	},
];

/** Bottom sheet on phones, centred dialog on larger screens. */
export function AddSheet({ open, onClose }: AddSheetProps) {
	const firstRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!open) return;
		firstRef.current?.focus();
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-50 grid items-end sm:place-items-center">
					<motion.button
						type="button"
						aria-label="Close"
						className="absolute inset-0 bg-plum-950/50 backdrop-blur-sm"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-labelledby="add-title"
						className="relative w-full rounded-t-panel bg-surface p-5 pb-safe shadow-lift sm:max-w-md sm:rounded-panel sm:pb-5"
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={{ type: "spring", stiffness: 420, damping: 38 }}
					>
						<div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line sm:hidden" />
						<div className="flex items-center justify-between">
							<h2 id="add-title" className="text-[1.6rem] font-bold">
								Add spending
							</h2>
							<button
								ref={firstRef}
								type="button"
								onClick={onClose}
								aria-label="Close"
								className="grid size-11 place-items-center rounded-full hover:bg-surface-2"
							>
								<X className="size-5" />
							</button>
						</div>
						<ul className="mt-4 space-y-2">
							{MODES.map(({ icon: Icon, title, hint, ready }) => (
								<li key={title}>
									<div className="flex w-full items-center gap-4 rounded-tile bg-bg p-4">
										<span className="grid size-12 shrink-0 place-items-center rounded-full bg-marigold text-plum-900">
											<Icon className="size-6" aria-hidden="true" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block font-semibold">{title}</span>
											<span className="block text-[0.9rem] text-ink-soft">
												{hint}
											</span>
										</span>
										<span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[0.78rem] font-medium text-ink-soft">
											Arrives in {ready}
										</span>
									</div>
								</li>
							))}
						</ul>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
