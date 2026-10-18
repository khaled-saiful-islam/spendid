import { Download, Smartphone, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TINTS } from "@/components/money/CategoryIcon";
import { InstallSheet } from "@/components/system/InstallSheet";
import { buttonClass } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { useInstall } from "@/lib/install";

const KEY = "spendid-install-nudge";
const QUIET_DAYS = 21;

function dismissedRecently(): boolean {
	try {
		const at = Number(localStorage.getItem(KEY) ?? 0);
		return Date.now() - at < QUIET_DAYS * 86_400_000;
	} catch {
		return false;
	}
}

/**
 * Phones only, until it's installed: a card on Home offering the app. One tap installs where
 * the browser allows it; otherwise the steps (and how to leave an in-app browser) open.
 */
export function InstallNudge() {
	const install = useInstall();
	const [hidden, setHidden] = useState(dismissedRecently);
	const [open, setOpen] = useState(false);
	const onPhone = install.platform === "ios" || install.platform === "android";
	const show = onPhone && !install.installed && !hidden;

	function notNow() {
		setHidden(true);
		try {
			localStorage.setItem(KEY, String(Date.now()));
		} catch {
			// Private mode: it just shows again next visit.
		}
	}

	async function getIt() {
		if (install.canPrompt) {
			if (await install.prompt())
				toast(t("Spendid is installed. Find it with your apps."));
		} else setOpen(true);
	}

	return (
		<>
			<AnimatePresence initial={false}>
				{show && (
					<motion.section
						aria-labelledby="install-nudge-title"
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, height: 0, marginTop: 0 }}
						className="relative overflow-hidden rounded-panel border border-line bg-surface p-4"
					>
						<span
							aria-hidden="true"
							className={cn(
								"pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.16] dark:opacity-[0.12]",
								TINTS.amber,
							)}
						/>
						<button
							type="button"
							onClick={notNow}
							aria-label={t("Not now")}
							className="absolute top-2 right-2 z-10 grid size-10 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
						>
							<X className="size-5" aria-hidden="true" />
						</button>
						<div className="relative flex items-start gap-3 pr-8">
							<img
								src="/icons/icon-192.png"
								alt=""
								className="size-12 shrink-0 rounded-[28%] shadow-coin"
							/>
							<div className="min-w-0">
								<h2
									id="install-nudge-title"
									className="font-sans text-[1.05rem] font-bold"
								>
									{t("Put Spendid on your home screen")}
								</h2>
								<p className="mt-0.5 text-[0.92rem] text-ink-soft">
									{install.inApp
										? t(
												"You opened Spendid inside another app. Open it in your browser to install it.",
											)
										: t("Opens in one tap, full screen, and works offline.")}
								</p>
								<button
									type="button"
									onClick={() => void getIt()}
									className={buttonClass("coin", "md", "mt-3")}
								>
									{install.canPrompt ? (
										<Download className="size-[1.1rem]" aria-hidden="true" />
									) : (
										<Smartphone className="size-[1.1rem]" aria-hidden="true" />
									)}
									{install.canPrompt ? t("Install") : t("Show me how")}
								</button>
							</div>
						</div>
					</motion.section>
				)}
			</AnimatePresence>
			<InstallSheet open={open} onClose={() => setOpen(false)} />
		</>
	);
}
