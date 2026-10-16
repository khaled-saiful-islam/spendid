import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { Toaster } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { meQuery } from "@/lib/me";
import { CaptureHost } from "../capture/CaptureHost";
import { capture } from "../capture/capture-store";
import { useLiveEvents } from "../live/useLiveEvents";
import { NAV_ITEMS, type NavItem } from "./nav";

function NavLink({ item, compact }: { item: NavItem; compact?: boolean }) {
	const Icon = item.icon;
	return (
		<Link
			to={item.to}
			activeOptions={{ exact: item.to === "/app" }}
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

function AddButton({ wide }: { wide?: boolean }) {
	return (
		<motion.button
			type="button"
			onClick={capture.openMenu}
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

/** Initials avatar that opens the Me page. */
function MeLink({ withName }: { withName?: boolean }) {
	const { data: me } = useQuery(meQuery);
	const name = me?.user.name ?? "";
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");
	return (
		<Link
			to="/app/me"
			aria-label="Your profile and settings"
			className="flex min-w-0 items-center gap-3 rounded-full p-1 pr-3 hover:bg-surface-2 data-[status=active]:bg-surface-2"
		>
			<span className="grid size-10 shrink-0 place-items-center rounded-full bg-plum-900 font-display font-bold text-marigold dark:bg-plum-50 dark:text-plum-900">
				{initials || "?"}
			</span>
			{withName && (
				<span className="min-w-0 font-semibold break-words">{name}</span>
			)}
		</Link>
	);
}

/** Phone: bottom bar with a centre + button. Desktop: sidebar. */
export function AppShell() {
	useLiveEvents();
	const [first, second, ...rest] = NAV_ITEMS;

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
			<aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line p-5 md:flex">
				<Link to="/app" aria-label="Spendid home">
					<Logo />
				</Link>
				<AddButton wide />
				<nav className="flex flex-col gap-1" aria-label="Main">
					{NAV_ITEMS.map((item) => (
						<NavLink key={item.to} item={item} />
					))}
				</nav>
				<div className="mt-auto flex items-center justify-between gap-2">
					<MeLink withName />
					<ThemeToggle />
				</div>
			</aside>

			<div className="min-w-0 pb-28 md:pb-0">
				<header className="flex items-center justify-between px-4 pt-4 md:hidden">
					<Link to="/app" aria-label="Spendid home">
						<Logo />
					</Link>
					<div className="flex items-center gap-1">
						<ThemeToggle />
						<MeLink />
					</div>
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
						<AddButton />
					</div>
					{rest.map((item) => (
						<NavLink key={item.to} item={item} compact />
					))}
				</div>
			</nav>

			<CaptureHost />
			<Toaster />
		</div>
	);
}
