import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/http";
import { meQuery } from "@/lib/me";
import { VoiceReview } from "../voice/VoiceReview";
import { AnswerText } from "./AnswerText";
import { ChartView } from "./charts/ChartView";
import { type ChatMessage, useAskChat } from "./useAskChat";

const SUGGESTIONS = [
	"How much did I spend on eating out this month?",
	"Where did my money go this week?",
	"Am I on track for my goals?",
	"Lunch 12 and grab 9 yesterday",
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

function Allowance() {
	const { data } = useQuery(aiStatusQuery);
	if (!data) return null;
	const pct =
		data.limitTokens > 0
			? Math.min(100, Math.round((data.usedTokens / data.limitTokens) * 100))
			: 100;
	return (
		<span
			className="inline-flex items-center gap-2 text-[0.82rem] text-ink-soft"
			title="AI allowance used this month"
		>
			<span
				className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2"
				aria-hidden="true"
			>
				<span
					className={cn(
						"block h-full rounded-full",
						pct > 85 ? "bg-coral" : "bg-jade",
					)}
					style={{ width: `${pct}%` }}
				/>
			</span>
			{data.enabled
				? `${pct}% of AI used this month`
				: "AI is off for your account"}
		</span>
	);
}

function Steps({ steps, live }: { steps: string[]; live: boolean }) {
	if (!steps.length && !live) return null;
	const shown = steps.length ? steps : ["Thinking…"];
	return (
		<ul
			className="mb-2 space-y-1 text-[0.85rem] text-ink-soft"
			aria-live="polite"
		>
			{shown.map((s, i) => (
				<motion.li
					// biome-ignore lint/suspicious/noArrayIndexKey: the same step can run twice; order is stable
					key={`${s}-${i}`}
					initial={{ opacity: 0, x: -6 }}
					animate={{ opacity: 1, x: 0 }}
					className="flex items-center gap-2"
				>
					<Sparkles
						className={cn(
							"size-3.5 text-plum-500",
							live && i === shown.length - 1 && "animate-pulse",
						)}
						aria-hidden="true"
					/>
					{s}
				</motion.li>
			))}
		</ul>
	);
}

function Message({
	m,
	question,
	onDraftsSaved,
}: {
	m: ChatMessage;
	question: string;
	onDraftsSaved: () => void;
}) {
	if (m.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				className="ml-auto max-w-[85%] rounded-panel rounded-br-md bg-plum-900 px-4 py-3 text-plum-50 dark:bg-plum-800"
			>
				{m.text}
			</motion.div>
		);
	}
	const live = m.status === "streaming";
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			className="max-w-[92%] space-y-3"
		>
			<div
				className={cn(
					"rounded-panel rounded-bl-md border px-4 py-3",
					m.status === "error"
						? "border-coral/40 bg-coral/8"
						: "border-line bg-surface",
				)}
			>
				<Steps steps={m.steps} live={live && !m.text} />
				{m.text && <AnswerText text={m.text} />}
			</div>
			{m.charts.map((c) => (
				<ChartView key={c.title} chart={c} />
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
		</motion.div>
	);
}

/** "Ask your money": questions in plain words, answers with numbers from your own data. */
export function AskPage({ initialQuestion }: { initialQuestion?: string }) {
	const { data: me } = useSuspenseQuery(meQuery);
	const chat = useAskChat(me?.user.id ?? "anon");
	const [draft, setDraft] = useState("");
	const endRef = useRef<HTMLDivElement>(null);
	const asked = useRef(false);

	useEffect(() => {
		if (initialQuestion && !asked.current) {
			asked.current = true;
			void chat.send(initialQuestion);
		}
	}, [initialQuestion, chat.send]);

	// Keep the newest message in view as the answer streams in.
	const lastText = chat.messages.at(-1)?.text ?? "";
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
		<div className="flex min-h-[calc(100dvh-10rem)] flex-col">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-[clamp(2rem,7vw,2.8rem)] font-bold">
						Ask Spendid
					</h1>
					<Allowance />
				</div>
				{chat.messages.length > 0 && (
					<button
						type="button"
						onClick={chat.clear}
						className="inline-flex h-10 items-center gap-2 rounded-full px-3 font-medium text-ink-soft hover:bg-surface-2 hover:text-ink"
					>
						<RotateCcw className="size-4" aria-hidden="true" /> New chat
					</button>
				)}
			</div>

			<div className="flex-1 space-y-4 py-6">
				{chat.messages.length === 0 ? (
					<div className="bg-scales rounded-panel border border-line px-5 py-10 text-center">
						<span className="mx-auto grid size-16 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin">
							<Sparkles className="size-8" aria-hidden="true" />
						</span>
						<p className="mt-4 font-display text-[1.4rem] font-bold">
							Ask anything about your money
						</p>
						<p className="mx-auto mt-1 max-w-[38ch] text-ink-soft">
							Answers come from your own spending. Your chat stays on this
							device.
						</p>
						<div className="mt-6 flex flex-wrap justify-center gap-2">
							{SUGGESTIONS.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => void chat.send(s)}
									className="rounded-full border-2 border-line bg-surface px-4 py-2 text-[0.92rem] font-medium hover:border-plum-300"
								>
									{s}
								</button>
							))}
						</div>
					</div>
				) : (
					<AnimatePresence initial={false}>
						{chat.messages.map((m, i) => (
							<Message
								key={m.id}
								m={m}
								question={chat.messages[i - 1]?.text ?? ""}
								onDraftsSaved={() => chat.markDraftsSaved(m.id)}
							/>
						))}
					</AnimatePresence>
				)}
				<div ref={endRef} />
			</div>

			<form
				onSubmit={onSubmit}
				className="sticky bottom-24 z-10 flex items-end gap-2 rounded-panel border border-line bg-surface p-2 shadow-lift md:bottom-4"
			>
				<label htmlFor="ask-input" className="sr-only">
					Your question
				</label>
				<textarea
					id="ask-input"
					rows={1}
					value={draft}
					maxLength={500}
					placeholder="Ask about your spending, or log something…"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							e.currentTarget.form?.requestSubmit();
						}
					}}
					className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 outline-none [field-sizing:content]"
				/>
				{chat.busy ? (
					<button
						type="button"
						onClick={chat.stop}
						aria-label="Stop"
						className="grid size-11 shrink-0 place-items-center rounded-full bg-plum-900 text-plum-50 dark:bg-plum-50 dark:text-plum-900"
					>
						<Square className="size-4" fill="currentColor" />
					</button>
				) : (
					<button
						type="submit"
						disabled={!draft.trim()}
						aria-label="Ask"
						className="grid size-11 shrink-0 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin disabled:opacity-40 disabled:shadow-none"
					>
						<ArrowUp className="size-5" strokeWidth={2.5} />
					</button>
				)}
			</form>
		</div>
	);
}
