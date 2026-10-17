import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Copy, MessageSquarePlus, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { meQuery } from "@/lib/me";
import { receiptImageUrl } from "@/lib/receipts-api";
import { VoiceReview } from "../voice/VoiceReview";
import { ActionCards, type ActionStatus } from "./ActionCards";
import { AiAllowance } from "./AiAllowance";
import { AnswerText } from "./AnswerText";
import { AskWelcome } from "./AskWelcome";
import { ChatsDrawerButton, ChatsPanel } from "./ChatsPanel";
import { Composer } from "./Composer";
import { ChartView } from "./charts/ChartView";
import { type CoinState, SpendidCoin } from "./SpendidCoin";
import { ThinkingTrail } from "./ThinkingTrail";
import { type ChatMessage, useAskChat } from "./useAskChat";

const FOLLOW_UPS = [
	t("Compare with last month"),
	t("Break it down by category"),
	t("Where could I spend less?"),
];

/** Starts a fresh conversation: a coin icon that spins on hover, with a clear label. */
function NewChatButton({ onClick }: { onClick: () => void }) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.94 }}
			className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-4 pl-1 font-semibold hover:bg-surface-2"
		>
			<span className="grid size-9 place-items-center rounded-full bg-marigold text-plum-900 transition-transform duration-500 group-hover:rotate-[360deg]">
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
				className="ml-auto max-w-[85%] rounded-[1.4rem] rounded-br-md bg-plum-900 px-4 py-3 text-plum-50 dark:bg-marigold/15 dark:text-ink dark:ring-1 dark:ring-marigold/30"
			>
				{m.receiptId && (
					<img
						src={receiptImageUrl(m.receiptId)}
						alt={t("The receipt you attached")}
						className="mb-2 max-h-48 w-auto rounded-tile bg-white/10 object-contain"
						onError={(e) => {
							e.currentTarget.style.display = "none";
						}}
					/>
				)}
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
								: "bg-line",
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
									className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[0.85rem] font-semibold hover:bg-plum-500/12"
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

/** "Ask your money": questions in plain words, answers with numbers from your own data. */
export function AskPage({ initialQuestion }: { initialQuestion?: string }) {
	const { data: me } = useSuspenseQuery(meQuery);
	const chat = useAskChat(me?.user.id ?? "anon");
	const endRef = useRef<HTMLDivElement>(null);
	const asked = useRef(false);
	const lastMsg = chat.messages.at(-1);

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

	const composer = (
		<Composer
			busy={chat.busy}
			floating={chat.messages.length > 0}
			onSend={(q, file) => void chat.send(q, undefined, file ?? undefined)}
			onStop={chat.stop}
		/>
	);

	const threads = {
		currentId: chat.threadId,
		onOpen: chat.open,
		onDelete: chat.remove,
	};

	return (
		<div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
			<aside
				aria-labelledby="chats-rail"
				className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] self-start overflow-y-auto overscroll-contain rounded-panel border border-line bg-surface/80 p-3 backdrop-blur lg:block"
			>
				<h2
					id="chats-rail"
					className="px-2 pt-1 pb-3 font-display text-[1.2rem] font-bold"
				>
					{t("Your chats")}
				</h2>
				<ChatsPanel {...threads} />
			</aside>
			<div className="relative flex min-h-[calc(100dvh-10rem)] flex-col">
				<div className="sticky top-0 z-20 -mx-4 -mt-3 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
					<PageHeader
						title={t("Ask Spendid")}
						sub={<AiAllowance />}
						aside={
							<div className="flex items-center gap-2">
								<ChatsDrawerButton {...threads} />
								{chat.messages.length > 0 && (
									<NewChatButton onClick={chat.clear} />
								)}
							</div>
						}
					/>
				</div>

				<div className="flex-1 space-y-5 py-4">
					{chat.messages.length === 0 ? (
						<AskWelcome
							composer={composer}
							onAsk={(q) => void chat.send(q)}
							onTone={(tone) =>
								void chat.send(
									tone === "roast"
										? t("Roast my spending this month.")
										: t("Hype me up about my money this month."),
									tone,
								)
							}
						/>
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

				{chat.messages.length > 0 && composer}
			</div>
		</div>
	);
}
