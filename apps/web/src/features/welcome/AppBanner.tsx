import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { useInstall } from "@/lib/install";

const KEY = "spendid-app-banner-dismissed";

function dismissedBefore(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

/** Phones only: a slim bar offering the app, until it's installed or closed. */
export function AppBanner({ onGetApp }: { onGetApp: () => void }) {
	const install = useInstall();
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (dismissedBefore()) return;
		const timer = setTimeout(() => setShow(true), 1500);
		return () => clearTimeout(timer);
	}, []);

	function close() {
		setShow(false);
		try {
			localStorage.setItem(KEY, "1");
		} catch {
			// Private mode: it just comes back next visit.
		}
	}

	return (
		<AnimatePresence>
			{show && !install.installed && (
				<motion.aside
					aria-label={t("Get the app")}
					initial={{ y: 120, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 120, opacity: 0 }}
					transition={{ type: "spring", stiffness: 300, damping: 30 }}
					className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-40 flex items-center gap-3 rounded-full bg-plum-900 py-2 pr-2 pl-2 text-plum-50 shadow-lift sm:hidden dark:bg-plum-700"
				>
					<img
						src="/icons/icon-192.png"
						alt=""
						className="size-10 shrink-0 rounded-full"
					/>
					<span className="min-w-0 flex-1 leading-tight">
						<span className="block font-bold">{t("Spendid app")}</span>
						<span className="block text-[0.78rem] text-plum-200">
							{t("Free. Installs in two taps.")}
						</span>
					</span>
					<button
						type="button"
						onClick={onGetApp}
						className="h-10 shrink-0 rounded-full bg-marigold px-4 font-semibold text-plum-900"
					>
						{t("Get")}
					</button>
					<button
						type="button"
						onClick={close}
						aria-label={t("Close")}
						className="grid size-10 shrink-0 place-items-center rounded-full text-plum-200 hover:bg-white/10"
					>
						<X className="size-5" aria-hidden="true" />
					</button>
				</motion.aside>
			)}
		</AnimatePresence>
	);
}
