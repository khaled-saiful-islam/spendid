import { Link, Outlet } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { cn } from "@/lib/cn";
import { AddSheet } from "./AddSheet";
import { NAV_ITEMS, type NavItem } from "./nav";

function NavLink({ item, compact }: { item: NavItem; compact?: boolean }) {
	const Icon = item.icon;
	return (
		<Link
			to={item.to}
			activeOptions={{ exact: true }}
			className={cn(
				"group flex items-center rounded-full font-medium text-ink-soft transition-colors",
				compact
					? "h-14 flex-1 flex-col justify-center gap-0.5 text-[0.72rem]"
					: "h-12 gap-3 px-4 hover:bg-surface-2 hover:text-ink",
			)}
			activeProps={{
				className: compact ? "text-ink" : "bg-surface-2 text-ink",
			}}
		>
			<Icon
				className="size-6 group-data-[status=active]:text-plum-500"
				aria-hidden="true"
			/>
			{item.label}
		</Link>
	);
}

function AddButton({ onClick, wide }: { onClick: () => void; wide?: boolean }) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.9 }}
			whileHover={{ scale: 1.04 }}
			aria-label="Add spending"
			className={cn(
				"grid place-items-center rounded-full bg-marigold text-plum-900 shadow-coin",
				wide
					? "h-12 w-full grid-flow-col gap-2 font-semibold"
					: "size-16 -translate-y-4",
			)}
		>
			<Plus
				className={wide ? "size-5" : "size-8"}
				strokeWidth={2.5}
				aria-hidden="true"
			/>
			{wide && "Add spending"}
		</motion.button>
	);
}

/** Phone: bottom bar with a centre + button. Desktop: sidebar. */
export function AppShell() {
	const [adding, setAdding] = useState(false);
	const [first, second, ...rest] = NAV_ITEMS;

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
			<aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line p-5 md:flex">
				<Link to="/" aria-label="Spendid home">
					<Logo />
				</Link>
				<AddButton wide onClick={() => setAdding(true)} />
				<nav className="flex flex-col gap-1" aria-label="Main">
					{NAV_ITEMS.map((item) => (
						<NavLink key={item.to} item={item} />
					))}
				</nav>
				<div className="mt-auto">
					<ThemeToggle />
				</div>
			</aside>

			<div className="min-w-0 pb-28 md:pb-0">
				<header className="flex items-center justify-between px-4 pt-4 md:hidden">
					<Link to="/" aria-label="Spendid home">
						<Logo />
					</Link>
					<ThemeToggle />
				</header>
				<main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-10">
					<Outlet />
				</main>
			</div>

			<nav
				aria-label="Main"
				className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 px-2 pb-safe backdrop-blur-xl md:hidden"
			>
				<div className="mx-auto flex max-w-md items-end">
					{first && <NavLink item={first} compact />}
					{second && <NavLink item={second} compact />}
					<div className="flex flex-1 justify-center">
						<AddButton onClick={() => setAdding(true)} />
					</div>
					{rest.map((item) => (
						<NavLink key={item.to} item={item} compact />
					))}
				</div>
			</nav>

			<AddSheet open={adding} onClose={() => setAdding(false)} />
		</div>
	);
}
