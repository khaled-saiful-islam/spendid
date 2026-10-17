import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "@/i18n";

interface DrawerProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}

/** A panel that slides in from the left (phones and tablets). Esc and the backdrop close it. */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
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

	return createPortal(
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-50">
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
						className="absolute inset-y-0 left-0 flex w-[min(24rem,88vw)] flex-col bg-surface shadow-lift outline-none"
						initial={{ x: "-100%" }}
						animate={{ x: 0 }}
						exit={{ x: "-100%" }}
						transition={{ type: "spring", stiffness: 420, damping: 40 }}
					>
						<div className="flex items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
							<h2 id={titleId} className="text-[1.5rem] font-bold">
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
						<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
							{children}
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
