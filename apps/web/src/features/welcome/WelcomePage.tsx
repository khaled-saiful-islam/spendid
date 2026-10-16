import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { CountUp } from "@/components/money/CountUp";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { CaptureModes } from "./CaptureModes";
import { FamilyShare } from "./FamilyShare";
import {
	DEMO_CURRENCY,
	DEMO_LOCALE,
	HeroDemo,
	useDemoSpending,
} from "./HeroDemo";
import { SiteFooter } from "./SiteFooter";

export function WelcomePage() {
	const demo = useDemoSpending();

	return (
		<div className="overflow-x-clip">
			<header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
				<Logo />
				<nav className="flex items-center gap-1">
					<ThemeToggle />
					<Link
						to="/signin"
						className={buttonClass("ghost", "md", "hidden sm:inline-flex")}
					>
						{t("Sign in")}
					</Link>
					<Link to="/signup" className={buttonClass("ink", "md")}>
						{t("Create account")}
					</Link>
				</nav>
			</header>

			<main>
				<section className="relative">
					<div className="bg-scales absolute inset-x-0 top-0 h-[70%] [mask-image:linear-gradient(#000,transparent)]" />
					<div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-16 sm:px-6 md:grid-cols-12 md:pt-20">
						<motion.div
							className="md:col-span-7"
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
						>
							<h1 className="text-[clamp(2.6rem,8.5vw,5.2rem)] font-extrabold">
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
							<p className="mt-6 max-w-[46ch] text-[1.15rem] text-ink-soft">
								{t(
									"Say it, snap it or type it. Spendid logs your spending in seconds and keeps that one number honest, every day.",
								)}
							</p>
							<div className="mt-8 flex flex-wrap gap-3">
								<Link to="/signup" className={buttonClass("coin", "lg")}>
									{t("Create a free account")}
								</Link>
								<Link to="/signin" className={buttonClass("ghost", "lg")}>
									{t("I have an account")}
								</Link>
							</div>
						</motion.div>

						<motion.div
							className="md:col-span-5"
							initial={{ opacity: 0, scale: 0.94 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{
								delay: 0.25,
								type: "spring",
								stiffness: 120,
								damping: 18,
							}}
						>
							<HeroDemo demo={demo} />
						</motion.div>
					</div>
				</section>

				<CaptureModes />
				<FamilyShare />
			</main>

			<div className="pt-16">
				<SiteFooter />
			</div>
		</div>
	);
}
