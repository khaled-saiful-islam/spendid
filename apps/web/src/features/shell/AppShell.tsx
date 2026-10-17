import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Logo } from "@/components/brand/Logo";
import { HideMoneyToggle } from "@/components/system/HideMoneyToggle";
import { OfflineBanner } from "@/components/system/OfflineBanner";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { Toaster } from "@/components/ui/Toast";
import { getLang, setLang, t } from "@/i18n";
import { cn } from "@/lib/cn";
import { meQuery } from "@/lib/me";
import { CaptureHost } from "../capture/CaptureHost";
import { useResumeInvite } from "../family/useResumeInvite";
import { useLiveEvents } from "../live/useLiveEvents";
import { AddButton } from "./AddButton";
import { ASK_ITEM, NAV_ITEMS, type NavItem } from "./nav";

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
			className={cn(
				"flex min-w-0 items-center gap-3 hover:bg-surface-2 data-[status=active]:bg-surface-2",
				withName ? "w-full rounded-tile p-2" : "rounded-full p-1",
			)}
		>
			<span
				aria-hidden="true"
				className="grid size-10 shrink-0 place-items-center rounded-full bg-plum-900 font-display font-bold text-marigold dark:bg-plum-50 dark:text-plum-900"
			>
				{initials || "?"}
			</span>
			{withName ? (
				<span className="min-w-0 flex-1">
					<span className="block leading-snug font-semibold [overflow-wrap:anywhere]">
						{name}
					</span>
					<span className="block text-[0.8rem] text-ink-soft">
						<span className="sr-only">, </span>
						{t("Profile and settings")}
					</span>
				</span>
			) : (
				<>
					<span className="sr-only">{name}</span>
					<span className="sr-only">, {t("profile and settings")}</span>
				</>
			)}
		</Link>
	);
}

/** The app follows the language saved in the profile (e.g. chosen during onboarding). */
function useProfileLanguage(): void {
	const { data: me } = useQuery(meQuery);
	const locale = me?.profile.locale;
	useEffect(() => {
		if (locale && locale !== getLang()) setLang(locale);
	}, [locale]);
}

/** Phone: bottom bar with a centre + button. Desktop: sidebar. */
export function AppShell() {
	useLiveEvents();
	useResumeInvite();
	useProfileLanguage();
	const [first, second, ...rest] = NAV_ITEMS;
	// Ask Spendid shows its chats beside the conversation on wide screens.
	const wide = useRouterState({
		select: (s) => s.location.pathname.startsWith("/app/ask"),
	});

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
			<aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line p-5 md:flex">
				<Link to="/app" aria-label={t("Spendid home")}>
					<Logo />
				</Link>
				<AddButton wide />
				<nav className="flex flex-col gap-1" aria-label={t("Main")}>
					{NAV_ITEMS.map((item) => (
						<NavLink key={item.to} item={item} />
					))}
					<NavLink item={ASK_ITEM} />
				</nav>
				<div className="mt-auto rounded-panel border border-line bg-surface p-1.5">
					<MeLink withName />
					<div className="mt-1 flex items-center justify-end gap-1 border-t border-line px-1 pt-1.5">
						<HideMoneyToggle />
						<ThemeToggle />
					</div>
				</div>
			</aside>

			<div className="min-w-0 pb-28 md:pb-0">
				<header className="flex items-center justify-between px-4 pt-4 md:hidden">
					<Link to="/app" aria-label={t("Spendid home")}>
						<Logo />
					</Link>
					<div className="flex items-center gap-1">
						<Link
							to="/app/ask"
							aria-label={t("Ask Spendid")}
							className="grid size-11 place-items-center rounded-full text-plum-500 hover:bg-surface-2 data-[status=active]:bg-surface-2"
						>
							<Sparkles className="size-5" />
						</Link>
						<HideMoneyToggle />
						<ThemeToggle />
						<MeLink />
					</div>
				</header>
				<main
					className={cn(
						"mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-10",
						wide && "lg:max-w-6xl",
					)}
				>
					<Outlet />
				</main>
			</div>

			<nav
				aria-label={t("Main")}
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

			<OfflineBanner />
			<CaptureHost />
			<Toaster />
		</div>
	);
}
