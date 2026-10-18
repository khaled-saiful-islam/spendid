import { Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { InstallSteps } from "@/components/system/InstallSheet";
import { buttonClass } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { type InstallPlatform, useInstall } from "@/lib/install";

const TABS: { id: InstallPlatform; label: string; Icon: typeof Monitor }[] = [
	{ id: "ios", label: "iPhone", Icon: Smartphone },
	{ id: "android", label: "Android", Icon: TabletSmartphone },
	{ id: "desktop", label: "Computer", Icon: Monitor },
];

/** A home screen with Spendid dropping into its place among the other apps. */
function HomeScreen() {
	const reduce = useReducedMotion();
	return (
		<div
			aria-hidden="true"
			className="grid w-full max-w-[15rem] grid-cols-4 gap-3 rounded-[1.6rem] bg-white/8 p-4 ring-1 ring-white/10"
		>
			{Array.from({ length: 12 }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative slots
					key={i}
					className="flex flex-col items-center gap-1"
				>
					{i === 5 ? (
						<motion.img
							src="/icons/icon-192.png"
							alt=""
							className="aspect-square w-full rounded-[0.8rem] shadow-coin"
							initial={reduce ? false : { y: -60, scale: 0.4, opacity: 0 }}
							whileInView={{ y: 0, scale: 1, opacity: 1 }}
							viewport={{ once: true, amount: 0.8 }}
							transition={{
								type: "spring",
								stiffness: 260,
								damping: 14,
								delay: 0.2,
							}}
						/>
					) : (
						<span className="aspect-square w-full rounded-[0.8rem] bg-white/12" />
					)}
					<span
						className={cn(
							"h-1.5 rounded-full",
							i === 5 ? "w-full bg-transparent" : "w-3/4 bg-white/12",
						)}
					>
						{i === 5 && (
							<span className="block -translate-y-0.5 text-center text-[0.6rem] leading-none font-semibold text-plum-50">
								Spendid
							</span>
						)}
					</span>
				</span>
			))}
		</div>
	);
}

/** "From your browser to your home screen": why it's an app, how to install, and a QR to scan. */
export function AppBand({ onGetApp }: { onGetApp: () => void }) {
	const install = useInstall();
	const [tab, setTab] = useState<InstallPlatform>(install.platform);
	const link = window.location.origin;

	return (
		<section
			aria-labelledby="get-app-title"
			className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
		>
			<div className="bg-scales relative overflow-hidden rounded-panel bg-plum-900 p-6 text-plum-50 sm:p-10 dark:bg-plum-800">
				<div className="relative grid items-center gap-10 md:grid-cols-2">
					<div>
						<h2
							id="get-app-title"
							className="text-[clamp(2rem,5vw,3rem)] leading-tight font-extrabold"
						>
							{t("Spendid lives on your home screen")}
						</h2>
						<p className="mt-3 max-w-[46ch] text-[1.05rem] text-plum-200">
							{t(
								"No app store and nothing to wait for. Install it from your browser in a few taps; it opens full screen and updates itself.",
							)}
						</p>
						<div
							role="tablist"
							aria-label={t("Your device")}
							className="mt-6 inline-flex flex-wrap gap-1 rounded-full bg-white/10 p-1"
						>
							{TABS.map(({ id, label, Icon }) => (
								<button
									key={id}
									type="button"
									role="tab"
									aria-selected={tab === id}
									onClick={() => setTab(id)}
									className={cn(
										"inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[0.92rem] font-semibold transition-colors",
										tab === id
											? "bg-marigold text-plum-900"
											: "text-plum-100 hover:bg-white/10",
									)}
								>
									<Icon className="size-4" aria-hidden="true" /> {t(label)}
								</button>
							))}
						</div>
						<div className="mt-4 text-ink" role="tabpanel">
							<InstallSteps platform={tab} />
						</div>
						{!install.installed && (
							<button
								type="button"
								onClick={onGetApp}
								className={buttonClass("coin", "lg", "mt-6")}
							>
								<Smartphone className="size-5" aria-hidden="true" />{" "}
								{t("Get the app")}
							</button>
						)}
					</div>
					<div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center md:flex-col lg:flex-row">
						<HomeScreen />
						<div className="flex flex-col items-center gap-2 text-center">
							<div className="w-36">
								<QrCode
									text={link}
									label={t("QR code that opens {link}", { link })}
								/>
							</div>
							<p className="max-w-[14rem] text-[0.9rem] text-plum-200">
								{t("On a computer? Scan with your phone's camera.")}
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
