import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { t } from "@/i18n";

interface SheetProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}

/** Bottom sheet on phones, centred dialog on larger screens. Esc and backdrop close it. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement as HTMLElement | null;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		requestAnimationFrame(() => {
			const target =
				panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
				panelRef.current;
			target?.focus();
		});
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
			previous?.focus?.();
		};
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-50 grid items-end sm:place-items-center sm:p-6">
					<motion.button
						type="button"
						aria-label={t("Close")}
						tabIndex={-1}
						className="absolute inset-0 bg-plum-950/50 backdrop-blur-sm"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						ref={panelRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						tabIndex={-1}
						className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-panel bg-surface p-5 pb-safe shadow-lift outline-none sm:max-w-lg sm:rounded-panel sm:pb-6"
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={{ type: "spring", stiffness: 420, damping: 38 }}
					>
						<div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line sm:hidden" />
						<div className="mb-4 flex items-center justify-between gap-3">
							<h2 id={titleId} className="text-[1.6rem] font-bold">
								{title}
							</h2>
							<button
								type="button"
								onClick={onClose}
								aria-label={t("Close")}
								className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2"
							>
								<X className="size-5" />
							</button>
						</div>
						{children}
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
