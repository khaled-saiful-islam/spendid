import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
	ArrowUp,
	Check,
	Copy,
	MessageSquarePlus,
	Sparkles,
	Square,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { api } from "@/lib/http";
import { meQuery } from "@/lib/me";
import { VoiceReview } from "../voice/VoiceReview";
import { ActionCards, type ActionStatus } from "./ActionCards";
import { AnswerText } from "./AnswerText";
import { AskWelcome } from "./AskWelcome";
import { ChatHistory } from "./ChatHistory";
import { ChartView } from "./charts/ChartView";
import { type CoinState, SpendidCoin } from "./SpendidCoin";
import { ThinkingTrail } from "./ThinkingTrail";
import { type ChatMessage, useAskChat } from "./useAskChat";

const FOLLOW_UPS = [
	t("Compare with last month"),
	t("Break it down by category"),
	t("Where could I spend less?"),
];

interface AiStatus {
	enabled: boolean;
	usedTokens: number;
	limitTokens: number;
}

const aiStatusQuery = {
	queryKey: ["ai-status"],
	queryFn: () => api<AiStatus>("/api/ai/status"),
	staleTime: 30_000,
};

/** A small ring: how much of this month's AI allowance is used. */
function AllowanceRing() {
	const { data } = useQuery(aiStatusQuery);
	if (!data) return null;
	const pct =
		data.limitTokens > 0
			? Math.min(100, Math.round((data.usedTokens / data.limitTokens) * 100))
			: 100;
	const r = 15;
	const c = 2 * Math.PI * r;
	return (
		<span
			className="inline-flex items-center gap-1.5 text-[0.82rem] text-ink-soft"
			title={t("AI allowance used this month")}
		>
			<svg
				viewBox="0 0 36 36"
				className="size-6 shrink-0 -rotate-90"
				aria-hidden="true"
			>
				<circle
					cx="18"
					cy="18"
					r={r}
					fill="none"
					stroke="var(--surface-2)"
					strokeWidth="4"
				/>
				<motion.circle
					cx="18"
					cy="18"
					r={r}
					fill="none"
					stroke={pct > 85 ? "var(--color-coral)" : "var(--color-jade)"}
					strokeWidth="4"
					strokeLinecap="round"
					strokeDasharray={c}
					initial={{ strokeDashoffset: c }}
					animate={{ strokeDashoffset: c * (1 - pct / 100) }}
					transition={{ duration: 1, ease: "easeOut" }}
				/>
			</svg>
			<span>{data.enabled ? `${pct}% AI used` : t("AI is off")}</span>
		</span>
	);
}

/** Starts a fresh conversation: a gradient coin icon that spins on hover, with a clear label. */
function NewChatButton({ onClick }: { onClick: () => void }) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.94 }}
			className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-4 pl-1 font-semibold shadow-sm transition-[box-shadow,border-color] hover:border-plum-300 hover:shadow-lift"
		>
			<span className="grid size-9 place-items-center rounded-full bg-linear-to-br from-marigold via-coral to-plum-500 text-white shadow-coin transition-transform duration-500 group-hover:rotate-[360deg]">
				<MessageSquarePlus className="size-4.5" aria-hidden="true" />
			</span>
			{t("New chat")}
		</motion.button>
	);
}

function CopyButton({ text }: { text: string }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			onClick={() =>
				void navigator.clipboard
					.writeText(text)
					.then(() => {
						setDone(true);
						setTimeout(() => setDone(false), 1800);
					})
					.catch(() => undefined)
			}
			className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[0.85rem] font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink"
		>
			{done ? (
				<Check className="size-4 text-safe" aria-hidden="true" />
			) : (
				<Copy className="size-4" aria-hidden="true" />
			)}
			{done ? t("Copied") : t("Copy")}
		</button>
	);
}

function Message({
	m,
	question,
	last,
	onDraftsSaved,
	onResolveAction,
	onAsk,
}: {
	m: ChatMessage;
	question: string;
	last: boolean;
	onDraftsSaved: () => void;
	onResolveAction: (index: number, status: ActionStatus) => void;
	onAsk: (q: string) => void;
}) {
	if (m.role === "user") {
		return (
			<motion.div
				layout
				initial={{ opacity: 0, y: 12, scale: 0.96 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				className="ml-auto max-w-[85%] rounded-[1.4rem] rounded-br-md bg-linear-to-br from-plum-500 to-plum-800 px-4 py-3 text-white shadow-lift"
			>
				{m.text}
			</motion.div>
		);
	}
	const live = m.status === "streaming";
	const state: CoinState = live ? (m.text ? "answering" : "thinking") : "idle";
	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			className="flex gap-3"
		>
			<SpendidCoin size="sm" state={state} className="mt-1" />
			<div className="min-w-0 flex-1 space-y-3">
				<div
					className={cn(
						"rounded-[1.4rem] rounded-tl-md p-[1.5px]",
						m.status === "error"
							? "bg-coral/50"
							: live
								? "animate-[ask-shimmer_2.4s_linear_infinite] bg-[length:200%_100%] bg-linear-to-r from-plum-300 via-marigold to-plum-300"
								: "bg-linear-to-br from-plum-300/70 via-line to-marigold/50",
					)}
				>
					<div
						className={cn(
							"rounded-[calc(1.4rem-1.5px)] rounded-tl-[calc(0.375rem-1px)] px-4 py-3",
							m.status === "error" ? "bg-coral/8" : "bg-surface",
						)}
					>
						<ThinkingTrail steps={m.steps} live={live && !m.text} />
						{m.text && <AnswerText text={m.text} />}
					</div>
				</div>
				{m.charts.map((c) => (
					<motion.div
						key={c.title}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
					>
						<ChartView chart={c} />
					</motion.div>
				))}
				{m.drafts && m.drafts.length > 0 && (
					<div className="rounded-panel border border-line bg-surface p-3">
						<VoiceReview
							result={{ transcript: question, drafts: m.drafts, readBy: "ai" }}
							hideTranscript
							onDone={onDraftsSaved}
						/>
					</div>
				)}
				{m.actions && m.actions.length > 0 && (
					<ActionCards items={m.actions} onResolve={onResolveAction} />
				)}
				{m.status === "done" && m.text && (
					<div className="flex flex-wrap items-center gap-1.5">
						<CopyButton text={m.text} />
						{last &&
							FOLLOW_UPS.map((f, i) => (
								<motion.button
									key={f}
									type="button"
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ delay: 0.15 + i * 0.06 }}
									onClick={() => onAsk(f)}
									className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[0.85rem] font-semibold hover:border-plum-300 hover:text-plum-700 dark:hover:text-plum-200"
								>
									<Sparkles
										className="size-3.5 text-marigold-deep"
										aria-hidden="true"
									/>
									{f}
								</motion.button>
							))}
					</div>
				)}
			</div>
		</motion.div>
	);
}

/** Soft colour light behind the page; still with reduced motion. */
function Aurora() {
	const reduce = useReducedMotion();
	const drift = (x: number[], y: number[], duration: number) =>
		reduce
			? undefined
			: {
					animate: { x, y },
					transition: {
						repeat: Number.POSITIVE_INFINITY,
						repeatType: "mirror" as const,
						duration,
					},
				};
	return (
		<div
			className="pointer-events-none fixed inset-0 -z-10 overflow-hidden md:left-64"
			aria-hidden="true"
		>
			<motion.div
				className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-plum-500/25 blur-3xl"
				{...drift([0, 60], [0, 40], 14)}
			/>
			<motion.div
				className="absolute top-1/3 -right-32 size-[26rem] rounded-full bg-marigold/25 blur-3xl"
				{...drift([0, -50], [0, 60], 17)}
			/>
			<motion.div
				className="absolute -bottom-40 left-1/4 size-[24rem] rounded-full bg-jade/20 blur-3xl"
				{...drift([0, 40], [0, -50], 19)}
			/>
		</div>
	);
}

/** "Ask your money": questions in plain words, answers with numbers from your own data. */
export function AskPage({ initialQuestion }: { initialQuestion?: string }) {
	const { data: me } = useSuspenseQuery(meQuery);
	const chat = useAskChat(me?.user.id ?? "anon");
	const [draft, setDraft] = useState("");
	const endRef = useRef<HTMLDivElement>(null);
	const asked = useRef(false);
	const firstName = (me?.user.name ?? "there").split(/\s+/)[0] ?? "there";
	const lastMsg = chat.messages.at(-1);
	const coinState: CoinState = chat.busy
		? lastMsg?.text
			? "answering"
			: "thinking"
		: "idle";

	useEffect(() => {
		if (initialQuestion && !asked.current) {
			asked.current = true;
			void chat.send(initialQuestion);
		}
	}, [initialQuestion, chat.send]);

	// Keep the newest message in view as the answer streams in.
	const lastText = lastMsg?.text ?? "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever messages or streamed words grow
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [chat.messages.length, lastText.length]);

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		const q = draft;
		setDraft("");
		void chat.send(q);
	}

	return (
		<div className="relative flex min-h-[calc(100dvh-10rem)] flex-col">
			<Aurora />
			<div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
				{chat.messages.length > 0 ? (
					<div className="flex min-w-0 items-center gap-3">
						<SpendidCoin size="md" state={coinState} />
						<div className="min-w-0">
							<h1 className="text-[1.25rem] leading-tight font-extrabold">
								{t("Ask Spendid")}
							</h1>
							<AllowanceRing />
						</div>
					</div>
				) : (
					<span />
				)}
				<div className="flex flex-wrap items-center justify-end gap-2">
					<ChatHistory
						currentId={chat.threadId}
						onOpen={chat.open}
						onDelete={chat.remove}
					/>
					{chat.messages.length > 0 && <NewChatButton onClick={chat.clear} />}
				</div>
			</div>

			<div className="flex-1 space-y-5 py-6">
				{chat.messages.length === 0 ? (
					<>
						<AskWelcome name={firstName} onAsk={(q) => void chat.send(q)} />
						<div className="flex justify-center pt-2">
							<AllowanceRing />
						</div>
					</>
				) : (
					<AnimatePresence initial={false}>
						{chat.messages.map((m, i) => (
							<Message
								key={m.id}
								m={m}
								question={chat.messages[i - 1]?.text ?? ""}
								last={i === chat.messages.length - 1}
								onDraftsSaved={() => chat.markDraftsSaved(m.id)}
								onResolveAction={(index, status) =>
									chat.resolveAction(m.id, index, status)
								}
								onAsk={(q) => void chat.send(q)}
							/>
						))}
					</AnimatePresence>
				)}
				<div ref={endRef} className="scroll-mb-40" />
			</div>

			<form onSubmit={onSubmit} className="sticky bottom-24 z-20 md:bottom-4">
				<div className="rounded-[1.75rem] bg-linear-to-r from-plum-500 via-coral to-marigold p-[2px] shadow-lift transition-shadow focus-within:shadow-[0_0_0_6px_rgb(122_79_196/0.18),0_18px_40px_-18px_rgb(42_20_70/0.45)]">
					<div className="flex items-end gap-2 rounded-[calc(1.75rem-2px)] bg-surface p-1.5 pl-4">
						<Sparkles
							className="mb-3 size-5 shrink-0 text-plum-500"
							aria-hidden="true"
						/>
						<label htmlFor="ask-input" className="sr-only">
							{t("Your question")}
						</label>
						<textarea
							id="ask-input"
							rows={1}
							value={draft}
							maxLength={500}
							placeholder={t("Ask or log something…")}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									e.currentTarget.form?.requestSubmit();
								}
							}}
							className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 outline-none [field-sizing:content] placeholder:text-ink-soft/70"
						/>
						{chat.busy ? (
							<button
								type="button"
								onClick={chat.stop}
								aria-label={t("Stop")}
								className="relative grid size-11 shrink-0 place-items-center rounded-full bg-plum-900 text-plum-50 dark:bg-plum-50 dark:text-plum-900"
							>
								<span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-marigold motion-reduce:hidden" />
								<Square className="size-4" fill="currentColor" />
							</button>
						) : (
							<motion.button
								type="submit"
								disabled={!draft.trim()}
								aria-label={t("Ask")}
								whileTap={{ scale: 0.9 }}
								className="grid size-11 shrink-0 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin transition-opacity disabled:opacity-40 disabled:shadow-none"
							>
								<ArrowUp className="size-5" strokeWidth={2.5} />
							</motion.button>
						)}
					</div>
				</div>
			</form>
		</div>
	);
}
