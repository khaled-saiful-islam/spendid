import type { AskThreadSummary } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { History, MessageSquareText, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { dateLocale, t } from "@/i18n";
import { threadsQuery } from "@/lib/ask-api";
import { cn } from "@/lib/cn";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

/** "5 minutes ago", "yesterday", in the app language. */
export function ago(iso: string): string {
	const diff = new Date(iso).getTime() - Date.now();
	const fmt = new Intl.RelativeTimeFormat(dateLocale(), { numeric: "auto" });
	for (const [unit, ms] of UNITS)
		if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
	return fmt.format(0, "minute");
}

interface HistoryProps {
	currentId: string;
	onOpen: (id: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}

/** The History button and the sheet listing every saved chat. */
export function ChatHistory({ currentId, onOpen, onDelete }: HistoryProps) {
	const [open, setOpen] = useState(false);
	const { data: threads = [] } = useQuery(threadsQuery);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 font-semibold shadow-sm hover:bg-surface-2"
			>
				<History className="size-5 text-plum-500" aria-hidden="true" />
				{t("History")}
				{threads.length > 0 && (
					<span className="num rounded-full bg-plum-500/12 px-2 text-[0.85rem] text-plum-500">
						{threads.length}
					</span>
				)}
			</button>
			<Sheet open={open} onClose={() => setOpen(false)} title={t("Your chats")}>
				<ThreadList
					threads={threads}
					currentId={currentId}
					onOpen={async (id) => {
						await onOpen(id);
						setOpen(false);
					}}
					onDelete={onDelete}
				/>
			</Sheet>
		</>
	);
}

function ThreadList({
	threads,
	currentId,
	onOpen,
	onDelete,
}: {
	threads: AskThreadSummary[];
	currentId: string;
	onOpen: (id: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const [confirming, setConfirming] = useState<string | null>(null);

	if (threads.length === 0)
		return (
			<p className="py-6 text-center text-ink-soft">
				{t("No saved chats yet. Ask something and it's kept here.")}
			</p>
		);

	async function attempt(fn: () => Promise<void>, failure: string) {
		try {
			await fn();
		} catch {
			toast(failure);
		}
	}

	return (
		<ul className="space-y-2">
			<AnimatePresence initial={false}>
				{threads.map((th) => {
					const current = th.id === currentId;
					return (
						<motion.li
							key={th.id}
							layout
							exit={{ opacity: 0, x: -24 }}
							className={cn(
								"flex items-center gap-2 rounded-tile border p-1.5",
								current ? "border-plum-500/40 bg-plum-500/8" : "border-line",
							)}
						>
							<button
								type="button"
								onClick={() =>
									void attempt(
										() => onOpen(th.id),
										t("Couldn't open that chat. Try again."),
									)
								}
								className="flex min-w-0 flex-1 items-start gap-3 rounded-[0.9rem] p-2 text-left hover:bg-surface-2"
							>
								<MessageSquareText
									className="mt-0.5 size-5 shrink-0 text-plum-500"
									aria-hidden="true"
								/>
								<span className="min-w-0">
									<span className="block font-semibold break-words">
										{th.title}
									</span>
									<span className="block text-[0.88rem] text-ink-soft">
										{current
											? t("Open now")
											: t("{n} messages, {when}", {
													n: th.messageCount,
													when: ago(th.updatedAt),
												})}
									</span>
								</span>
							</button>
							{confirming === th.id ? (
								<button
									type="button"
									onClick={() =>
										void attempt(
											() => onDelete(th.id),
											t("Couldn't delete. Try again."),
										).then(() => setConfirming(null))
									}
									className="h-10 shrink-0 rounded-full bg-coral px-3 text-[0.9rem] font-semibold text-white"
								>
									{t("Delete")}
								</button>
							) : (
								<button
									type="button"
									onClick={() => setConfirming(th.id)}
									aria-label={t("Delete chat: {title}", { title: th.title })}
									className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-coral/10 hover:text-coral"
								>
									<Trash2 className="size-5" aria-hidden="true" />
								</button>
							)}
						</motion.li>
					);
				})}
			</AnimatePresence>
		</ul>
	);
}
