import type { AskThreadSummary } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BarChart3,
	CircleCheck,
	MessagesSquare,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useDeferredValue, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { toast } from "@/components/ui/Toast";
import { dateLocale, t } from "@/i18n";
import { askThreadsApi, THREADS_KEY, threadsQuery } from "@/lib/ask-api";
import { cn } from "@/lib/cn";
import { appToday, atHourOn } from "@/lib/time";

const DAY = 86_400_000;

/** "5 minutes ago", "yesterday", in the app language. */
export function ago(iso: string): string {
	const diff = new Date(iso).getTime() - Date.now();
	const fmt = new Intl.RelativeTimeFormat(dateLocale(), { numeric: "auto" });
	for (const [unit, ms] of [
		["day", DAY],
		["hour", 3_600_000],
		["minute", 60_000],
	] as const)
		if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
	return fmt.format(0, "minute");
}

/** Today / Yesterday / Earlier this week / Earlier, newest first. */
export function groupByDay(
	threads: AskThreadSummary[],
	now = new Date(),
): { label: string; items: AskThreadSummary[] }[] {
	// Days start at midnight in the app's time zone.
	const startOfToday = atHourOn(appToday(now), 0).getTime();
	const buckets = [
		{ label: t("Today"), from: startOfToday, items: [] as AskThreadSummary[] },
		{
			label: t("Yesterday"),
			from: startOfToday - DAY,
			items: [] as AskThreadSummary[],
		},
		{
			label: t("Earlier this week"),
			from: startOfToday - 7 * DAY,
			items: [] as AskThreadSummary[],
		},
		{
			label: t("Earlier"),
			from: Number.NEGATIVE_INFINITY,
			items: [] as AskThreadSummary[],
		},
	];
	for (const th of threads) {
		const at = new Date(th.updatedAt).getTime();
		buckets.find((b) => at >= b.from)?.items.push(th);
	}
	return buckets
		.filter((b) => b.items.length > 0)
		.map(({ label, items }) => ({ label, items }));
}

function Highlight({ text, term }: { text: string; term: string }) {
	if (!term) return <>{text}</>;
	const at = text.toLowerCase().indexOf(term.toLowerCase());
	if (at < 0) return <>{text}</>;
	return (
		<>
			{text.slice(0, at)}
			<mark className="rounded bg-marigold/40 px-0.5 text-ink">
				{text.slice(at, at + term.length)}
			</mark>
			{text.slice(at + term.length)}
		</>
	);
}

interface PanelProps {
	currentId: string;
	onOpen: (id: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
	/** Called after a chat opens (the drawer closes itself). */
	onOpened?: () => void;
}

/** Search and every saved chat, grouped by day. Used as the desktop rail and the phone drawer. */
export function ChatsPanel({
	currentId,
	onOpen,
	onDelete,
	onOpened,
}: PanelProps) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const term = useDeferredValue(search.trim());
	const { data: threads = [], isFetching } = useQuery(threadsQuery(term));

	async function open(id: string) {
		try {
			await onOpen(id);
			onOpened?.();
		} catch {
			toast(t("Couldn't open that chat. Try again."));
		}
	}

	async function remove(th: AskThreadSummary) {
		try {
			// Keep a copy so Undo can put it back exactly.
			const copy = await askThreadsApi.get(th.id);
			await onDelete(th.id);
			toast(t("Chat deleted."), {
				label: t("Undo"),
				run: () =>
					void askThreadsApi
						.save(copy.id, copy.messages)
						.then(() =>
							queryClient.invalidateQueries({ queryKey: THREADS_KEY }),
						),
			});
		} catch {
			toast(t("Couldn't delete. Try again."));
		}
	}

	return (
		<div className="space-y-4">
			<label className="relative block">
				<span className="sr-only">{t("Search your chats")}</span>
				<Search
					className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-ink-soft"
					aria-hidden="true"
				/>
				<input
					type="search"
					data-autofocus
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={t("Search your chats")}
					className="h-11 w-full rounded-full border-2 border-line bg-bg pr-10 pl-10 outline-none placeholder:text-ink-soft focus:border-plum-300 [&::-webkit-search-cancel-button]:hidden"
				/>
				{search && (
					<button
						type="button"
						onClick={() => setSearch("")}
						aria-label={t("Clear search")}
						className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
					>
						<X className="size-4" />
					</button>
				)}
			</label>

			{threads.length === 0 ? (
				<p className="px-2 py-8 text-center text-ink-soft">
					{term
						? isFetching
							? t("Searching…")
							: t("No chats mention “{term}”.", { term })
						: t("No saved chats yet. Ask something and it's kept here.")}
				</p>
			) : (
				groupByDay(threads).map((group) => (
					<section
						key={group.label}
						aria-label={group.label}
						className="space-y-1"
					>
						<h3 className="px-2 text-[0.8rem] font-semibold text-ink-soft">
							{group.label}
						</h3>
						<ul className="space-y-0.5">
							<AnimatePresence initial={false}>
								{group.items.map((th) => {
									const current = th.id === currentId;
									return (
										<motion.li
											key={th.id}
											layout
											exit={{ opacity: 0, x: -20, height: 0 }}
											className={cn(
												"group relative flex items-start gap-1 rounded-tile",
												current ? "bg-plum-500/10" : "hover:bg-surface-2",
											)}
										>
											{current && (
												<motion.span
													layoutId="chat-current"
													className="absolute inset-y-2 left-0 w-1 rounded-full bg-plum-500"
												/>
											)}
											<button
												type="button"
												onClick={() => void open(th.id)}
												aria-current={current ? "true" : undefined}
												className="min-w-0 flex-1 px-3 py-2.5 text-left"
											>
												<span className="block font-semibold break-words">
													<Highlight text={th.title} term={term} />
												</span>
												{term && th.preview && (
													<span className="mt-0.5 block text-[0.88rem] break-words text-ink-soft">
														<Highlight text={th.preview} term={term} />
													</span>
												)}
												<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] text-ink-soft">
													<span>{ago(th.updatedAt)}</span>
													{th.hasChart && (
														<Badge
															icon={
																<BarChart3
																	className="size-3.5"
																	aria-hidden="true"
																/>
															}
														>
															{t("Chart")}
														</Badge>
													)}
													{th.madeSomething && (
														<Badge
															tone="safe"
															icon={
																<CircleCheck
																	className="size-3.5"
																	aria-hidden="true"
																/>
															}
														>
															{t("Saved something")}
														</Badge>
													)}
												</span>
											</button>
											<button
												type="button"
												onClick={() => void remove(th)}
												aria-label={t("Delete chat: {title}", {
													title: th.title,
												})}
												className="m-1.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft opacity-100 hover:bg-coral/12 hover:text-over focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
											>
												<Trash2 className="size-4" aria-hidden="true" />
											</button>
										</motion.li>
									);
								})}
							</AnimatePresence>
						</ul>
					</section>
				))
			)}
		</div>
	);
}

function Badge({
	icon,
	children,
	tone,
}: {
	icon: ReactNode;
	children: ReactNode;
	tone?: "safe";
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium",
				tone === "safe"
					? "bg-jade/12 text-safe"
					: "bg-plum-500/10 text-plum-500",
			)}
		>
			{icon}
			{children}
		</span>
	);
}

/** The phone / tablet button that opens the chats drawer. */
export function ChatsDrawerButton(props: Omit<PanelProps, "onOpened">) {
	const [open, setOpen] = useState(false);
	const { data: threads = [] } = useQuery(threadsQuery());
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 font-semibold shadow-sm hover:bg-surface-2 sm:px-3.5 lg:hidden"
			>
				<MessagesSquare className="size-5 text-plum-500" aria-hidden="true" />
				<span className="max-sm:sr-only">{t("Chats")}</span>
				{threads.length > 0 && (
					<span className="num min-w-6 rounded-full bg-plum-500 px-1.5 text-center text-[0.8rem] text-white dark:text-plum-950">
						{threads.length}
					</span>
				)}
			</button>
			<Drawer
				open={open}
				onClose={() => setOpen(false)}
				title={t("Your chats")}
			>
				<ChatsPanel {...props} onOpened={() => setOpen(false)} />
			</Drawer>
		</>
	);
}
