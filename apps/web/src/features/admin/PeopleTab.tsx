import { useQuery } from "@tanstack/react-query";
import {
	Bot,
	KeyRound,
	PauseCircle,
	PlayCircle,
	Search,
	Trash2,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import {
	type AdminPerson,
	adminApi,
	formatTokens,
	overviewQuery,
	peopleQuery,
} from "@/lib/admin-api";
import { cn } from "@/lib/cn";
import { formatMoment } from "@/lib/time";
import {
	AiLimitForm,
	DeleteForm,
	PauseForm,
	type PersonAction,
} from "./PersonActions";

const shortDate = (iso: string | null) =>
	iso
		? formatMoment(iso, {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: "Never";

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");
}

function Row({
	p,
	defaultTokens,
	onAction,
}: {
	p: AdminPerson;
	defaultTokens: number;
	onAction: (a: PersonAction) => void;
}) {
	const limit = p.ai.limitTokens ?? defaultTokens;
	const pct =
		limit > 0
			? Math.min(100, Math.round((p.ai.usedTokens / limit) * 100))
			: 100;
	const isAdmin = p.role === "admin";
	const action =
		"inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.88rem] font-medium hover:bg-surface-2";

	return (
		<li className="rounded-panel border border-line bg-surface p-4">
			<div className="flex items-start gap-3">
				<span className="grid size-11 shrink-0 place-items-center rounded-full bg-plum-900 font-display font-bold text-marigold dark:bg-plum-50 dark:text-plum-900">
					{initials(p.name)}
				</span>
				<div className="min-w-0 flex-1">
					<p className="flex flex-wrap items-center gap-2 font-semibold">
						<span className="break-words">{p.name}</span>
						{isAdmin && (
							<span className="rounded-full bg-plum-500/12 px-2 py-0.5 text-[0.75rem] text-plum-500">
								Admin
							</span>
						)}
						{p.banned && (
							<span className="rounded-full bg-coral/12 px-2 py-0.5 text-[0.75rem] text-over">
								Paused
							</span>
						)}
						{!p.emailVerified && (
							<span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.75rem] text-ink-soft">
								Email not confirmed
							</span>
						)}
					</p>
					<p className="text-[0.9rem] break-all text-ink-soft">{p.email}</p>
					<p className="mt-1 text-[0.82rem] text-ink-soft">
						Joined {shortDate(p.createdAt)}.{" "}
						{p.lastActiveAt
							? `Last active ${shortDate(p.lastActiveAt)}.`
							: "No recent sign-in."}
					</p>
				</div>
			</div>
			{!isAdmin && (
				<>
					<div className="mt-3 flex items-center gap-3">
						<Bot className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
						<span
							className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
							aria-hidden="true"
						>
							<span
								className={cn(
									"block h-full rounded-full",
									!p.ai.enabled ? "bg-line" : pct > 85 ? "bg-coral" : "bg-jade",
								)}
								style={{ width: `${pct}%` }}
							/>
						</span>
						<span className="num shrink-0 text-[0.85rem] text-ink-soft">
							{p.ai.enabled
								? `${formatTokens(p.ai.usedTokens)} of ${formatTokens(limit)}`
								: "AI off"}
						</span>
					</div>
					<div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
						<button
							type="button"
							className={action}
							onClick={() => onAction("ai")}
						>
							<Bot className="size-4" aria-hidden="true" /> AI limit
						</button>
						<button
							type="button"
							className={action}
							onClick={() =>
								void adminApi
									.sendReset(p.id)
									.then(() => toast(`Reset link sent to ${p.email}.`))
									.catch(() => toast("Couldn't send the reset link."))
							}
						>
							<KeyRound className="size-4" aria-hidden="true" /> Send reset link
						</button>
						<button
							type="button"
							className={action}
							onClick={() => onAction("pause")}
						>
							{p.banned ? (
								<PlayCircle className="size-4" aria-hidden="true" />
							) : (
								<PauseCircle className="size-4" aria-hidden="true" />
							)}
							{p.banned ? "Restore" : "Pause"}
						</button>
						<button
							type="button"
							className={cn(action, "text-over hover:bg-coral/12")}
							onClick={() => onAction("delete")}
						>
							<Trash2 className="size-4" aria-hidden="true" /> Delete
						</button>
					</div>
				</>
			)}
		</li>
	);
}

/** Find people, see their AI use (counts only), and manage their accounts. */
export function PeopleTab() {
	const [search, setSearch] = useState("");
	const q = useDeferredValue(search.trim());
	const { data, isPending } = useQuery(peopleQuery(q));
	const { data: overview } = useQuery(overviewQuery);
	const [open, setOpen] = useState<{
		person: AdminPerson;
		action: PersonAction;
	} | null>(null);
	const defaultTokens = overview?.settings.defaultMonthlyTokens ?? 200_000;
	const close = () => setOpen(null);
	const titles: Record<PersonAction, string> = {
		ai: "AI settings",
		pause: open?.person.banned ? "Restore account" : "Pause account",
		delete: "Delete account",
	};

	return (
		<div className="space-y-4">
			<label className="relative block">
				<span className="sr-only">Search people</span>
				<Search
					className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-soft"
					aria-hidden="true"
				/>
				<input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by name, email or username"
					className="h-12 w-full rounded-full border-2 border-line bg-surface pr-4 pl-12 outline-none focus:border-plum-500"
				/>
			</label>
			{isPending ? (
				<div className="h-40 animate-pulse rounded-panel bg-surface-2" />
			) : (
				<ul className="space-y-3">
					{data?.items.map((p) => (
						<Row
							key={p.id}
							p={p}
							defaultTokens={defaultTokens}
							onAction={(action) => setOpen({ person: p, action })}
						/>
					))}
					{data?.items.length === 0 && (
						<p className="rounded-panel border border-dashed border-line p-6 text-center text-ink-soft">
							No one matches that.
						</p>
					)}
				</ul>
			)}
			<Sheet
				open={open !== null}
				onClose={close}
				title={open ? `${titles[open.action]}: ${open.person.name}` : ""}
			>
				{open?.action === "ai" && (
					<AiLimitForm
						person={open.person}
						defaultTokens={defaultTokens}
						onDone={close}
					/>
				)}
				{open?.action === "pause" && (
					<PauseForm person={open.person} onDone={close} />
				)}
				{open?.action === "delete" && (
					<DeleteForm person={open.person} onDone={close} />
				)}
			</Sheet>
		</div>
	);
}
