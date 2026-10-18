import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { t } from "@/i18n";
import { useOnline } from "@/lib/online";

/** A calm note when the connection drops; it goes away by itself when it's back. */
export function OfflineBanner() {
	const online = useOnline();
	return (
		<AnimatePresence>
			{!online && (
				<motion.div
					role="status"
					initial={{ y: -40, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: -40, opacity: 0 }}
					className="fixed inset-x-0 top-0 z-[80] flex justify-center px-4 pt-safe"
				>
					<p className="mt-2 inline-flex items-center gap-2 rounded-full bg-plum-900 px-4 py-2 text-[0.9rem] font-semibold text-plum-50 shadow-lift">
						<WifiOff className="size-4 shrink-0" aria-hidden="true" />{" "}
						{t("You're offline. New changes need a connection.")}
					</p>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
