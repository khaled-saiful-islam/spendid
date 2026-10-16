import { formatMinor, type PulseItem, REACTIONS } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, SmilePlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CategoryIcon } from "@/components/money/CategoryIcon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { familyApi, pulseQuery } from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { Avatar, ago } from "./parts";

const PAGE = 6;

function sentence(item: PulseItem): string {
	const who = item.mine ? "You" : item.actorName;
	const amount =
		item.amountMinor !== null && item.currency
			? formatMinor(Math.abs(item.amountMinor), item.currency)
			: "";
	if (item.kind === "joined")
		return `You and ${item.title} joined each other's circle`;
	if (item.kind === "deposit")
		return item.amountMinor !== null && item.amountMinor < 0
			? `${who} took ${amount} out of ${item.title}`
			: `${who} added ${amount} to ${item.title}`;
	return `${who} spent ${amount} at ${item.title}`;
}

function Reactions({ item }: { item: PulseItem }) {
	const queryClient = useQueryClient();
	const [picking, setPicking] = useState(false);
	const mineEmoji = item.reactions.find((r) => r.mine)?.emoji ?? null;
	const canReact = !item.mine && item.kind !== "joined";

	async function react(emoji: string | null) {
		setPicking(false);
		try {
			await familyApi.react({
				kind: item.kind === "deposit" ? "deposit" : "expense",
				targetId: item.id,
				emoji: emoji as (typeof REACTIONS)[number] | null,
			});
			await queryClient.invalidateQueries({ queryKey: pulseQuery.queryKey });
		} catch (err) {
			toast(
				err instanceof ApiError ? err.message : "Couldn't react. Try again.",
			);
		}
	}

	return (
		<div className="mt-2 flex flex-wrap items-center gap-1.5">
			{item.reactions.map((r) => (
				<motion.button
					key={r.emoji}
					type="button"
					layout
					initial={{ scale: 0.6 }}
					animate={{ scale: 1 }}
					disabled={!canReact}
					onClick={() => void react(r.mine ? null : r.emoji)}
					title={r.names.join(", ")}
					aria-label={`${r.emoji} ${r.count}${r.names.length ? ` from ${r.names.join(", ")}` : ""}${r.mine ? ". Tap to take yours back" : ""}`}
					className={cn(
						"inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[0.9rem] font-semibold",
						r.mine
							? "border-plum-500 bg-plum-500/12"
							: "border-line bg-surface",
					)}
				>
					<span aria-hidden="true">{r.emoji}</span>
					<span className="num">{r.count}</span>
				</motion.button>
			))}
			{canReact && (
				<div className="relative">
					<button
						type="button"
						onClick={() => setPicking((p) => !p)}
						aria-expanded={picking}
						aria-label="React"
						className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
					>
						<SmilePlus className="size-5" aria-hidden="true" />
					</button>
					<AnimatePresence>
						{picking && (
							<motion.div
								initial={{ opacity: 0, y: 6, scale: 0.9 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: 6, scale: 0.9 }}
								className="absolute bottom-10 left-0 z-10 flex gap-1 rounded-full border border-line bg-surface p-1 shadow-lift"
							>
								{REACTIONS.map((emoji, i) => (
									<motion.button
										key={emoji}
										type="button"
										initial={{ scale: 0 }}
										animate={{ scale: 1 }}
										transition={{ delay: i * 0.03 }}
										whileHover={{ scale: 1.3, y: -3 }}
										onClick={() =>
											void react(mineEmoji === emoji ? null : emoji)
										}
										aria-label={`React ${emoji}`}
										className="grid size-10 place-items-center rounded-full text-[1.4rem]"
									>
										{emoji}
									</motion.button>
								))}
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}

/** Live family feed: what people chose to share, jar deposits and new connections. */
export function Pulse() {
	const { data = [], isPending } = useQuery(pulseQuery);
	const [shown, setShown] = useState(PAGE);
	return (
		<section aria-labelledby="pulse-heading" className="space-y-3">
			<h2
				id="pulse-heading"
				className="flex items-center gap-2 text-[1.6rem] font-bold"
			>
				<Activity className="size-6 text-coral" aria-hidden="true" /> Family
				pulse
				<span className="relative ml-1 flex size-2.5" aria-hidden="true">
					<span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-60 motion-reduce:hidden" />
					<span className="relative inline-flex size-2.5 rounded-full bg-coral" />
				</span>
			</h2>
			{isPending ? (
				<div className="h-32 animate-pulse rounded-panel bg-surface-2" />
			) : data.length === 0 ? (
				<p className="rounded-panel border-2 border-dashed border-line p-5 text-ink-soft">
					When people share expenses or add to a shared jar, it shows up here as
					it happens.
				</p>
			) : (
				<ol className="space-y-2">
					<AnimatePresence initial={false}>
						{data.slice(0, shown).map((item) => (
							<motion.li
								key={`${item.kind}-${item.id}`}
								layout
								initial={{ opacity: 0, y: -12 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								className="flex gap-3 rounded-tile border border-line bg-surface p-3"
							>
								<div className="relative shrink-0">
									<Avatar name={item.actorName} seed={item.actorId} />
									<span className="absolute -right-1 -bottom-1">
										{item.kind === "expense" ? (
											<CategoryIcon
												icon={item.icon}
												tint={item.tint ?? undefined}
												size="sm"
												className="size-6 ring-2 ring-surface [&_svg]:size-3.5"
											/>
										) : (
											<span
												className="grid size-6 place-items-center rounded-full bg-surface text-[0.9rem] ring-2 ring-surface"
												aria-hidden="true"
											>
												{item.icon}
											</span>
										)}
									</span>
								</div>
								<div className="min-w-0 flex-1">
									<p className="font-semibold break-words">{sentence(item)}</p>
									<p className="text-[0.82rem] text-ink-soft">{ago(item.at)}</p>
									<Reactions item={item} />
								</div>
							</motion.li>
						))}
					</AnimatePresence>
				</ol>
			)}
			{data.length > shown && (
				<button
					type="button"
					onClick={() => setShown((n) => n + PAGE * 2)}
					className="w-full rounded-full border-2 border-line py-3 font-semibold hover:bg-surface-2"
				>
					Show more ({data.length - shown})
				</button>
			)}
		</section>
	);
}
