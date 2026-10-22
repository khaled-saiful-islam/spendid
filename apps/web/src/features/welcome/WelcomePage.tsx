import { Link } from "@tanstack/react-router";
import { Check, Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { CountUp } from "@/components/money/CountUp";
import { InstallSheet } from "@/components/system/InstallSheet";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { buttonClass } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { useInstall } from "@/lib/install";
import { AppBand } from "./AppBand";
import { AppBanner } from "./AppBanner";
import { CaptureModes } from "./CaptureModes";
import { FamilyShare } from "./FamilyShare";
import {
	DEMO_CURRENCY,
	DEMO_LOCALE,
	HeroDemo,
	useDemoSpending,
} from "./HeroDemo";
import { PhoneFrame } from "./PhoneFrame";
import { SiteFooter } from "./SiteFooter";

/** Install straight away where the browser allows it; otherwise show the steps and the QR. */
function useGetApp() {
	const install = useInstall();
	const [open, setOpen] = useState(false);
	const getApp = () => {
		if (install.canPrompt)
			void install.prompt().then((yes) => {
				if (yes) toast(t("Spendid is installed. Find it with your apps."));
			});
		else setOpen(true);
	};
	return { install, getApp, open, close: () => setOpen(false) };
}

const PLATFORMS = [
	{ label: "iPhone", Icon: Smartphone },
	{ label: "Android", Icon: TabletSmartphone },
	{ label: "Computer", Icon: Monitor },
];

export function WelcomePage() {
	const demo = useDemoSpending();
	const app = useGetApp();
	const link = typeof window === "undefined" ? "" : window.location.origin;

	return (
		<div className="overflow-x-clip pb-24 sm:pb-0">
			<header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
				<Logo />
				<nav className="flex items-center gap-1 sm:gap-2">
					<ThemeToggle />
					<Link
						to="/signin"
						className={buttonClass(
							"ghost",
							"md",
							"px-3 whitespace-nowrap sm:px-4",
						)}
					>
						{t("Sign in")}
					</Link>
					{!app.install.installed && (
						<button
							type="button"
							onClick={app.getApp}
							className={buttonClass("coin", "md", "hidden sm:inline-flex")}
						>
							<Smartphone className="size-[1.1rem]" aria-hidden="true" />{" "}
							{t("Get the app")}
						</button>
					)}
					<Link
						to="/signup"
						className={buttonClass("ink", "md", "hidden sm:inline-flex")}
					>
						{t("Create account")}
					</Link>
				</nav>
			</header>

			<main>
				<section className="relative">
					<div className="bg-scales absolute inset-x-0 top-0 h-[70%] [mask-image:linear-gradient(#000,transparent)]" />
					<div className="relative mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 md:grid-cols-12 md:pt-16">
						<motion.div
							className="md:col-span-7"
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
						>
							<h1 className="text-[clamp(2.4rem,8vw,4.6rem)] font-extrabold">
								{t("Today you can spend")}{" "}
								<span className="inline-block rounded-[0.4em] bg-marigold px-[0.25em] text-plum-900 shadow-coin">
									<CountUp
										minor={demo.remaining}
										currency={DEMO_CURRENCY}
										locale={DEMO_LOCALE}
										className="num"
									/>
								</span>{" "}
								{t("and still hit your goals.")}
							</h1>
							<p className="mt-5 max-w-[46ch] text-[1.1rem] text-ink-soft">
								{t(
									"Say it, snap it or type it. Spendid logs your spending in seconds and keeps that one number honest, every day.",
								)}
							</p>

							{/* Phones: install right here. */}
							<div className="mt-7 space-y-3 sm:hidden">
								{!app.install.installed && (
									<button
										type="button"
										onClick={app.getApp}
										className={buttonClass("coin", "lg", "w-full")}
									>
										<Smartphone className="size-5" aria-hidden="true" />{" "}
										{t("Get the app, it's free")}
									</button>
								)}
								<Link
									to="/signup"
									className={buttonClass("ink", "lg", "w-full")}
								>
									{t("Create a free account")}
								</Link>
							</div>

							{/* Computers: scan to get it on the phone. */}
							<div className="mt-8 hidden max-w-xl items-center gap-5 rounded-panel border border-line bg-surface p-4 shadow-lift sm:flex">
								<div className="w-28 shrink-0">
									<QrCode
										text={link}
										label={t("QR code that opens {link}", { link })}
									/>
								</div>
								<div className="min-w-0">
									<p className="font-display text-[1.2rem] font-bold">
										{t("Get Spendid on your phone")}
									</p>
									<p className="mt-1 text-[0.92rem] text-ink-soft">
										{t(
											"Scan with your phone's camera. It installs from the browser in two taps, no app store.",
										)}
									</p>
									<div className="mt-3 flex flex-wrap gap-2">
										{!app.install.installed && (
											<button
												type="button"
												onClick={app.getApp}
												className={buttonClass("coin", "md")}
											>
												<Smartphone
													className="size-[1.1rem]"
													aria-hidden="true"
												/>{" "}
												{t("Get the app")}
											</button>
										)}
										<Link to="/signup" className={buttonClass("ink", "md")}>
											{t("Create a free account")}
										</Link>
									</div>
								</div>
							</div>

							<ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.88rem] font-semibold text-ink-soft">
								{PLATFORMS.map(({ label, Icon }) => (
									<li key={label} className="inline-flex items-center gap-1.5">
										<Icon className="size-4 text-plum-500" aria-hidden="true" />
										{t(label)}
									</li>
								))}
								<li className="inline-flex items-center gap-1.5">
									<Check className="size-4 text-safe" aria-hidden="true" />
									{t("No app store needed")}
								</li>
							</ul>
						</motion.div>

						<div className="md:col-span-5">
							<PhoneFrame />
						</div>
					</div>
				</section>

				<section
					aria-labelledby="try-title"
					className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 px-4 pb-8 sm:px-6 md:grid-cols-2"
				>
					<div>
						<h2
							id="try-title"
							className="text-[clamp(2rem,5vw,3rem)] leading-tight font-extrabold"
						>
							{t("One number, always honest.")}
						</h2>
						<p className="mt-3 max-w-[44ch] text-[1.05rem] text-ink-soft">
							{t(
								"Tap something you bought. Spendid takes it off today's amount straight away, so you always know what's safe to spend.",
							)}
						</p>
					</div>
					<HeroDemo demo={demo} />
				</section>

				<AppBand onGetApp={app.getApp} />
				<CaptureModes />
				<FamilyShare />
			</main>

			<div className="pt-16">
				<SiteFooter />
			</div>
			<AppBanner onGetApp={app.getApp} />
			<InstallSheet open={app.open} onClose={app.close} />
		</div>
	);
}
