import { CircleCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";

interface ToastItem {
	id: number;
	message: string;
	action?: { label: string; run: () => void };
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
	for (const l of listeners) l();
};

function dismiss(id: number): void {
	items = items.filter((t) => t.id !== id);
	emit();
}

/** Shows a short confirmation; an optional action (like Undo) stays for 6 seconds. */
export function toast(message: string, action?: ToastItem["action"]): void {
	const id = nextId++;
	items = [...items.slice(-2), { id, message, action }];
	emit();
	setTimeout(() => dismiss(id), action ? 6000 : 3500);
}

function useToasts(): ToastItem[] {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => items,
	);
}

/** Mount once. Sits above the phone tab bar. */
export function Toaster() {
	const list = useToasts();
	return (
		<div
			aria-live="polite"
			className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8"
		>
			<AnimatePresence>
				{list.map((t) => (
					<motion.div
						key={t.id}
						layout
						initial={{ opacity: 0, y: 24, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 12, scale: 0.95 }}
						className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-plum-900 py-2 pr-2 pl-4 text-plum-50 shadow-lift dark:bg-plum-50 dark:text-plum-900"
					>
						<CircleCheck
							className="size-5 shrink-0 text-jade"
							aria-hidden="true"
						/>
						<span className="min-w-0 flex-1 text-[0.95rem]">{t.message}</span>
						{t.action && (
							<button
								type="button"
								onClick={() => {
									t.action?.run();
									dismiss(t.id);
								}}
								className="h-10 shrink-0 rounded-full bg-marigold px-4 font-semibold text-plum-900"
							>
								{t.action.label}
							</button>
						)}
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
