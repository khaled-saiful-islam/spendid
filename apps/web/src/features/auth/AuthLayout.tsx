import { Link } from "@tanstack/react-router";
import { Lock, Mic, Users, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitch } from "@/components/system/LanguageSwitch";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { t } from "@/i18n";
import { AuthShowcase } from "./AuthShowcase";

interface AuthLayoutProps {
	title: ReactNode;
	intro?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	/** First name as it's typed: the live demo greets them by it. */
	greetingName?: string;
}

const PROMISES = [
	{ Icon: Wallet, text: "One number each morning: what you can safely spend." },
	{ Icon: Mic, text: "Log by voice, photo or a few words." },
	{ Icon: Users, text: "Share with family only when both of you agree." },
];

/**
 * Sign in, sign up and the rest of the account screens. Phones: a dark band with Spendid
 * working live, and the form in a card rising over it. Desktop: the same, as a full-height
 * panel beside the form.
 */
export function AuthLayout({
	title,
	intro,
	children,
	footer,
	greetingName,
}: AuthLayoutProps) {
	const reduce = useReducedMotion();
	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
			<aside className="bg-scales relative overflow-hidden rounded-b-[2rem] bg-plum-900 px-4 pt-3 pb-16 text-plum-50 sm:px-6 lg:flex lg:min-h-dvh lg:flex-col lg:rounded-none lg:p-10 dark:bg-plum-800">
				<div className="flex items-center justify-between">
					<Link to="/" aria-label={t("Spendid home")} className="text-plum-50">
						<Logo />
					</Link>
					<ThemeToggle className="text-plum-50 lg:hidden" />
				</div>
				<div className="mx-auto mt-5 w-full max-w-md lg:mx-0 lg:my-auto lg:max-w-sm">
					<div className="lg:hidden">
						<AuthShowcase name={greetingName} />
					</div>
					<div className="hidden lg:block">
						<AuthShowcase large name={greetingName} />
						<ul className="mt-10 space-y-4">
							{PROMISES.map(({ Icon, text }, i) => (
								<motion.li
									key={text}
									initial={reduce ? false : { opacity: 0, x: -12 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: 0.2 + i * 0.12 }}
									className="flex items-start gap-3 font-display text-[1.2rem] leading-snug"
								>
									<span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-marigold">
										<Icon className="size-[1.1rem]" aria-hidden="true" />
									</span>
									<span className="pt-1">{t(text)}</span>
								</motion.li>
							))}
						</ul>
					</div>
				</div>
			</aside>

			<div className="relative -mt-10 px-4 pb-10 sm:px-6 lg:mt-0 lg:flex lg:min-h-dvh lg:flex-col lg:px-10">
				<div className="hidden justify-end pt-6 lg:flex">
					<ThemeToggle />
				</div>
				<main className="mx-auto w-full max-w-md lg:my-auto">
					<motion.div
						initial={reduce ? false : { opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ type: "spring", stiffness: 140, damping: 20 }}
						className="rounded-[calc(1.75rem+2px)] bg-linear-to-br from-plum-500 via-coral to-marigold p-[2px] shadow-[0_30px_60px_-28px_rgb(122_79_196/0.55)] dark:shadow-[0_30px_60px_-28px_rgb(245_184_61/0.35)]"
					>
						<div className="rounded-panel bg-surface p-5 sm:p-7">
							<h1 className="text-[1.85rem] leading-tight font-extrabold sm:text-[2.1rem]">
								{title}
							</h1>
							{intro && (
								<div className="mt-1.5 text-[1rem] text-ink-soft">{intro}</div>
							)}
							<div className="mt-6">{children}</div>
							{footer && (
								<div className="mt-6 border-t border-line pt-5 text-center text-ink-soft">
									{footer}
								</div>
							)}
						</div>
					</motion.div>
					<p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-[0.85rem] text-ink-soft">
						<Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
						{t(
							"Your money stays yours. The people who run Spendid can't see your spending.",
						)}
					</p>
					<div className="mt-4 flex justify-center">
						<LanguageSwitch signedIn={false} />
					</div>
				</main>
			</div>
		</div>
	);
}
