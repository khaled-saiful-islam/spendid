import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronUp,
	Eye,
	EyeOff,
	LogOut,
	Moon,
	Smartphone,
	Sun,
	UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { InstallSheet } from "@/components/system/InstallSheet";
import { LanguageSwitch } from "@/components/system/LanguageSwitch";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { hideMoney, useHideMoney } from "@/lib/hide-money";
import { meQuery } from "@/lib/me";
import { useTheme } from "@/lib/theme";

/**
 * The account corner of the sidebar: who you are, and one menu for profile, privacy, theme,
 * language and signing out. Long names and emails wrap; nothing is cut.
 */
export function AccountCard() {
	const { data: me } = useQuery(meQuery);
	const [open, setOpen] = useState(false);
	const [installing, setInstalling] = useState(false);
	const menuId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const name = me?.user.name ?? "";
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		const onDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("pointerdown", onDown);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("pointerdown", onDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative">
			<AnimatePresence>
				{open && (
					<motion.div
						id={menuId}
						role="dialog"
						aria-label={t("Account")}
						initial={{ opacity: 0, y: 8, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 8, scale: 0.97 }}
						transition={{ type: "spring", stiffness: 420, damping: 32 }}
						className="absolute bottom-full left-0 z-30 mb-2 w-[19rem] origin-bottom-left rounded-panel border border-line bg-surface p-2 shadow-lift"
					>
						<AccountMenu
							onDone={() => setOpen(false)}
							onInstall={() => setInstalling(true)}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				title={t("Profile, settings and sign out")}
				aria-expanded={open}
				aria-controls={menuId}
				className="group flex w-full items-center gap-3 rounded-panel border border-line bg-surface p-2.5 text-left transition-colors hover:bg-surface-2"
			>
				<span
					aria-hidden="true"
					className="grid size-10 shrink-0 place-items-center rounded-full bg-marigold font-display text-[0.9rem] font-extrabold text-plum-900"
				>
					{initials || "?"}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block text-[0.95rem] leading-snug font-bold break-words">
						{name}
					</span>
					<span className="block text-[0.8rem] text-ink-soft">
						{t("Profile & settings")}
					</span>
				</span>
				<ChevronUp
					className={cn(
						"size-4 shrink-0 text-ink-soft transition-transform",
						open ? "rotate-0" : "rotate-180",
					)}
					aria-hidden="true"
				/>
			</button>
			<InstallSheet open={installing} onClose={() => setInstalling(false)} />
		</div>
	);
}

function AccountMenu({
	onDone,
	onInstall,
}: {
	onDone: () => void;
	onInstall: () => void;
}) {
	const hidden = useHideMoney();
	const { theme, toggle } = useTheme();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	async function signOut() {
		await authClient.signOut();
		queryClient.clear();
		await navigate({ to: "/" });
	}

	return (
		<div className="space-y-1">
			<Link
				to="/app/me"
				onClick={onDone}
				className="flex items-center gap-3 rounded-tile px-3 py-2.5 font-semibold hover:bg-surface-2"
			>
				<UserRound className="size-5 text-plum-500" aria-hidden="true" />
				{t("Profile and settings")}
			</Link>
			<button
				type="button"
				onClick={() => {
					onDone();
					onInstall();
				}}
				className="flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left font-semibold hover:bg-surface-2"
			>
				<Smartphone className="size-5 text-plum-500" aria-hidden="true" />
				{t("Get the app and share it")}
			</button>
			<Switch
				icon={
					hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />
				}
				label={t("Hide amounts")}
				on={hidden}
				onToggle={hideMoney.toggle}
			/>
			<Switch
				icon={
					theme === "dark" ? (
						<Moon className="size-5" />
					) : (
						<Sun className="size-5" />
					)
				}
				label={t("Dark theme")}
				on={theme === "dark"}
				onToggle={toggle}
			/>
			<div className="px-1 py-1.5">
				<LanguageSwitch signedIn className="w-full justify-between" />
			</div>
			<div className="my-1 border-t border-line" />
			<button
				type="button"
				onClick={() => void signOut()}
				className="flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left font-semibold text-over hover:bg-coral/10"
			>
				<LogOut className="size-5" aria-hidden="true" />
				{t("Sign out")}
			</button>
		</div>
	);
}

/** A labelled on/off row, so nothing in the menu is an unexplained icon. */
function Switch({
	icon,
	label,
	on,
	onToggle,
}: {
	icon: ReactNode;
	label: string;
	on: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			onClick={onToggle}
			className="flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left font-semibold hover:bg-surface-2"
		>
			<span className="text-plum-500" aria-hidden="true">
				{icon}
			</span>
			<span className="flex-1">{label}</span>
			<span
				aria-hidden="true"
				className={cn(
					"relative h-6 w-10 shrink-0 rounded-full transition-colors",
					on ? "bg-plum-500" : "bg-line",
				)}
			>
				<span
					className={cn(
						"absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
						on ? "translate-x-[1.125rem]" : "translate-x-0.5",
					)}
				/>
			</span>
		</button>
	);
}
