import { PIP_LEVELS } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronsUpDown,
	Eye,
	EyeOff,
	Flame,
	LogOut,
	Moon,
	Sun,
	UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { LanguageSwitch } from "@/components/system/LanguageSwitch";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { streakQuery } from "@/lib/delight-api";
import { hideMoney, useHideMoney } from "@/lib/hide-money";
import { meQuery } from "@/lib/me";
import { usePipLook } from "@/lib/pip-wardrobe";
import { useTheme } from "@/lib/theme";

const R = 24;
const C = 2 * Math.PI * R;

/** Initials inside Pip's level ring: the ring fills as Pip grows towards the next level. */
function LevelAvatar({
	initials,
	progress,
	streak,
}: {
	initials: string;
	progress: number;
	streak: number;
}) {
	return (
		<span
			className="relative grid size-14 shrink-0 place-items-center"
			aria-hidden="true"
		>
			<svg
				viewBox="0 0 56 56"
				aria-hidden="true"
				className="absolute inset-0 size-full -rotate-90"
			>
				<circle
					cx="28"
					cy="28"
					r={R}
					fill="none"
					stroke="rgb(255 255 255 / 0.14)"
					strokeWidth="3.5"
				/>
				<motion.circle
					cx="28"
					cy="28"
					r={R}
					fill="none"
					stroke="var(--color-marigold)"
					strokeWidth="3.5"
					strokeLinecap="round"
					strokeDasharray={C}
					initial={{ strokeDashoffset: C }}
					animate={{ strokeDashoffset: C * (1 - Math.min(1, progress)) }}
					transition={{ duration: 1, ease: "easeOut" }}
				/>
			</svg>
			<span className="grid size-10 place-items-center rounded-full bg-marigold font-display text-[0.95rem] font-extrabold text-plum-900">
				{initials || "?"}
			</span>
			{streak > 0 && (
				<span className="absolute -right-1 -bottom-1 inline-flex items-center gap-0.5 rounded-full bg-coral px-1.5 py-0.5 text-[0.68rem] font-bold text-white ring-2 ring-plum-900">
					<Flame className="size-3" />
					{streak}
				</span>
			)}
		</span>
	);
}

/**
 * The account corner of the sidebar: who you are, Pip's level and your streak, and one menu for
 * profile, privacy, theme, language and signing out. Long names wrap; nothing is cut.
 */
export function AccountCard() {
	const { data: me } = useQuery(meQuery);
	const { data: streak } = useQuery(streakQuery);
	const look = usePipLook(streak);
	const [open, setOpen] = useState(false);
	const menuId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const name = me?.user.name ?? "";
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");
	const prev = PIP_LEVELS[look.level.level - 1]?.days ?? 0;
	const logged = streak?.loggedDays ?? 0;
	const progress = look.level.next
		? (logged - prev) / (look.level.next.days - prev)
		: 1;

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
						<AccountMenu onDone={() => setOpen(false)} />
					</motion.div>
				)}
			</AnimatePresence>

			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-controls={menuId}
				className="bg-scales group block w-full rounded-panel bg-plum-900 p-3.5 text-left text-plum-50 shadow-lift transition-transform hover:-translate-y-0.5 dark:bg-plum-800"
			>
				<span className="flex items-start justify-between gap-2">
					<LevelAvatar
						initials={initials}
						progress={progress}
						streak={streak?.current ?? 0}
					/>
					<span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[0.72rem] font-bold text-marigold">
						{t("Lv {n}", { n: look.level.level })}
						<ChevronsUpDown
							className="size-4 text-plum-200 transition-colors group-hover:text-marigold"
							aria-hidden="true"
						/>
					</span>
				</span>
				<span className="mt-2.5 block text-[1.02rem] leading-snug font-bold break-words">
					{name}
				</span>
				<span className="mt-0.5 block text-[0.82rem] text-plum-200">
					{t(look.level.title)}
					{streak && streak.current > 0
						? `, ${t("{n}-day streak", { n: streak.current })}`
						: ""}
				</span>
			</button>
		</div>
	);
}

function AccountMenu({ onDone }: { onDone: () => void }) {
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
