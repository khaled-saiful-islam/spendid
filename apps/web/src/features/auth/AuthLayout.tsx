import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { SafeDial } from "@/components/money/SafeDial";
import { ThemeToggle } from "@/components/system/ThemeToggle";

interface AuthLayoutProps {
	title: string;
	intro?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}

const PROMISES = [
	"One number each morning: what you can safely spend.",
	"Log by voice, photo or a few words.",
	"Share with family only when both of you agree.",
];

/** Brand panel beside the form on desktop; a slim plum band above it on phones. */
export function AuthLayout({
	title,
	intro,
	children,
	footer,
}: AuthLayoutProps) {
	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
			<aside className="bg-scales relative hidden overflow-hidden bg-plum-900 p-10 text-plum-50 lg:flex lg:flex-col dark:bg-plum-950">
				<Link to="/" aria-label="Spendid home" className="text-plum-50">
					<Logo />
				</Link>
				<div className="my-auto">
					<SafeDial
						remainingMinor={4820}
						allowanceMinor={6000}
						className="w-56"
					/>
					<ul className="mt-10 space-y-4">
						{PROMISES.map((p, i) => (
							<motion.li
								key={p}
								initial={{ opacity: 0, x: -12 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.2 + i * 0.12 }}
								className="flex max-w-[30ch] gap-3 font-display text-[1.35rem] leading-snug"
							>
								<span
									className="mt-2.5 size-2 shrink-0 rounded-full bg-marigold"
									aria-hidden="true"
								/>
								{p}
							</motion.li>
						))}
					</ul>
				</div>
			</aside>

			<div className="flex min-h-dvh flex-col">
				<header className="flex items-center justify-between bg-plum-900 px-4 py-3 text-plum-50 lg:bg-transparent lg:px-8 lg:pt-6 lg:text-ink dark:bg-plum-950 lg:dark:bg-transparent">
					<Link to="/" aria-label="Spendid home" className="lg:invisible">
						<Logo />
					</Link>
					<ThemeToggle className="text-current" />
				</header>
				<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45 }}
					>
						<h1 className="text-[clamp(2.1rem,7vw,2.8rem)] font-extrabold">
							{title}
						</h1>
						{intro && (
							<div className="mt-3 text-[1.05rem] text-ink-soft">{intro}</div>
						)}
						<div className="mt-8">{children}</div>
						{footer && (
							<div className="mt-8 text-center text-ink-soft">{footer}</div>
						)}
					</motion.div>
				</main>
			</div>
		</div>
	);
}
