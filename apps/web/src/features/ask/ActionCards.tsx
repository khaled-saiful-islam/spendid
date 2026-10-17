import type { AskAction } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Loader2, Share2, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { buzz } from "@/lib/haptics";
import { ApiError } from "@/lib/http";
import { specFor } from "./actions";

export type ActionStatus = "ready" | "done" | "dismissed" | "undone";
export interface ActionItem {
	action: AskAction;
	status: ActionStatus;
}

interface CardsProps {
	items: ActionItem[];
	onResolve: (index: number, status: ActionStatus) => void;
}

/** What the assistant prepared, one card each. Nothing changes until the person confirms. */
export function ActionCards({ items, onResolve }: CardsProps) {
	return (
		<div className="space-y-3">
			{items.map((item, i) =>
				item.status === "dismissed" ? null : (
					<ActionCard
						// Cards never reorder; the index is their identity within one answer.
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed list per answer
						key={i}
						item={item}
						onResolve={(s) => onResolve(i, s)}
					/>
				),
			)}
		</div>
	);
}

function ActionCard({
	item,
	onResolve,
}: {
	item: ActionItem;
	onResolve: (s: ActionStatus) => void;
}) {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const { action } = item;
	const spec = specFor(action);
	const done = item.status === "done";
	const undone = item.status === "undone";
	const canUndo = Boolean(spec.undo) && (spec.canUndo?.(action) ?? true);

	/** Runs a step, refreshes what's on screen, and reports errors in the card. */
	async function step(work: () => Promise<void>): Promise<boolean> {
		setPending(true);
		setError(null);
		try {
			await work();
			await queryClient.invalidateQueries();
			return true;
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : t("Couldn't save. Try again."),
			);
			return false;
		} finally {
			setPending(false);
		}
	}

	async function confirm() {
		const ok = await step(async () => {
			const result = await spec.run(action);
			if (result?.url) setUrl(result.url);
		});
		if (!ok) return;
		buzz("success");
		toast(spec.done(action));
		onResolve("done");
	}

	async function undo() {
		if (!(await step(() => spec.undo?.(action) ?? Promise.resolve()))) return;
		toast(t("Undone. It's back as it was."));
		onResolve("undone");
	}

	const link = spec.link?.(action);

	return (
		<motion.section
			initial={{ opacity: 0, y: 14, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ type: "spring", stiffness: 220, damping: 22 }}
			className={cn(
				"relative overflow-hidden rounded-panel border bg-surface p-4 shadow-lift",
				done ? "border-jade/50" : "border-line",
				undone && "opacity-80",
			)}
			aria-label={spec.title(action)}
		>
			<p className="text-[0.85rem] font-semibold text-ink-soft">
				{spec.title(action)}
			</p>
			<div className="mt-2">
				<spec.Body action={action} done={done} />
			</div>
			{error && (
				<p role="alert" className="mt-3 text-[0.9rem] font-medium text-coral">
					{error}
				</p>
			)}
			<AnimatePresence mode="wait" initial={false}>
				{done || undone ? (
					<motion.div
						key="done"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						className="mt-4 space-y-3"
					>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold",
									undone
										? "bg-surface-2 text-ink-soft"
										: "bg-jade/12 text-safe",
								)}
							>
								{undone ? (
									<Undo2 className="size-4" aria-hidden="true" />
								) : (
									<Check className="size-4" aria-hidden="true" />
								)}
								{undone ? t("Undone. It's back as it was.") : spec.done(action)}
							</span>
							{done && link && (
								<Link
									to={link.to}
									className="font-semibold underline decoration-marigold decoration-2 underline-offset-4"
								>
									{t(link.label)}
								</Link>
							)}
							{done && canUndo && (
								<button
									type="button"
									onClick={undo}
									disabled={pending}
									className="inline-flex items-center gap-1.5 font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
								>
									{pending ? (
										<Loader2
											className="size-4 animate-spin"
											aria-hidden="true"
										/>
									) : (
										<Undo2 className="size-4" aria-hidden="true" />
									)}
									{t("Undo")}
								</button>
							)}
						</div>
						{done && url && <ShareLink url={url} />}
					</motion.div>
				) : (
					<motion.div
						key="ask"
						exit={{ opacity: 0 }}
						className="mt-4 flex flex-wrap gap-2"
					>
						<button
							type="button"
							onClick={confirm}
							disabled={pending}
							className={buttonClass(
								spec.careful ? "ghost" : "coin",
								"md",
								spec.careful
									? "border-2 border-coral/50 text-coral"
									: undefined,
							)}
						>
							{pending && (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							)}
							{spec.confirm(action)}
						</button>
						<button
							type="button"
							onClick={() => onResolve("dismissed")}
							disabled={pending}
							className={buttonClass("ghost", "md")}
						>
							{t("Not now")}
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.section>
	);
}

/** A link to send (an invite or a split): copy it, or the phone's share sheet. */
function ShareLink({ url }: { url: string }) {
	const canShare = typeof navigator !== "undefined" && "share" in navigator;
	return (
		<div className="space-y-2 rounded-tile bg-surface-2 p-3">
			<p className="num text-[0.9rem] break-all">{url}</p>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() =>
						void navigator.clipboard
							.writeText(url)
							.then(() => toast(t("Link copied.")))
							.catch(() =>
								toast(t("Couldn't copy. Press and hold the link instead.")),
							)
					}
					className={buttonClass("ghost", "sm", "border-2 border-line")}
				>
					<Copy className="size-4" aria-hidden="true" />
					{t("Copy link")}
				</button>
				{canShare && (
					<button
						type="button"
						onClick={() => void navigator.share({ url }).catch(() => undefined)}
						className={buttonClass("ghost", "sm", "border-2 border-line")}
					>
						<Share2 className="size-4" aria-hidden="true" />
						{t("Share")}
					</button>
				)}
			</div>
		</div>
	);
}
