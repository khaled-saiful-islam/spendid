import type { ChartSpec, StoredAskMessage, VoiceDraft } from "@spendid/shared";
import { ASK_THREAD_MAX_MESSAGES } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { askThreadsApi, streamAsk, THREADS_KEY } from "@/lib/ask-api";
import { ApiError } from "@/lib/http";
import { uuid } from "@/lib/uuid";
import type { ActionItem, ActionStatus } from "./ActionCards";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	steps: string[];
	charts: ChartSpec[];
	drafts: VoiceDraft[] | null;
	/** Goals, deposits, limits and wishes to confirm. Older saved chats don't have it. */
	actions?: ActionItem[];
	status: "streaming" | "done" | "error";
}

const MAX_KEPT = ASK_THREAD_MAX_MESSAGES;
const HISTORY_SENT = 6;
const SAVE_DELAY_MS = 600;

function load(key: string): ChatMessage[] {
	try {
		const raw = localStorage.getItem(key);
		const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
		return Array.isArray(parsed)
			? parsed.filter((m) => m.status !== "streaming")
			: [];
	} catch {
		return [];
	}
}

function save(key: string, messages: ChatMessage[]): void {
	try {
		localStorage.setItem(
			key,
			JSON.stringify(
				messages.filter((m) => m.status !== "streaming").slice(-MAX_KEPT),
			),
		);
	} catch {
		// Storage full or blocked: the chat still works for this visit.
	}
}

function readCurrentId(key: string): string {
	try {
		const saved = localStorage.getItem(key);
		if (saved) return saved;
	} catch {
		// Storage blocked: a fresh id still works for this visit.
	}
	return uuid();
}

function hasStoredId(key: string): boolean {
	try {
		return localStorage.getItem(key) !== null;
	} catch {
		return true;
	}
}

function writeCurrentId(key: string, id: string): void {
	try {
		localStorage.setItem(key, id);
	} catch {
		// Storage blocked: the chat is still saved on the server.
	}
}

/** What the server keeps: finished messages only, trimmed to the stored limits. */
function toStored(messages: ChatMessage[]): StoredAskMessage[] {
	return messages
		.filter((m) => m.status !== "streaming")
		.slice(-MAX_KEPT)
		.map((m) => ({
			id: m.id,
			role: m.role,
			text: m.text.slice(0, 8000),
			steps: m.steps.slice(0, 20).map((s) => s.slice(0, 120)),
			charts: m.charts.slice(0, 4),
			drafts: m.drafts?.slice(0, 10) ?? null,
			actions: m.actions,
			status: m.status === "error" ? "error" : "done",
		}));
}

/**
 * What an earlier answer looked like to the model. Answers that came with cards say which tool
 * made them, so the model learns that a card needs a tool call, not just the words.
 */
const CLAIMS_A_CARD =
	/\b(i'?ve prepared|i have prepared|prepared (a|your|the)|ready to confirm|tap (the|a) card|saya (telah )?sediakan)\b/i;

/**
 * Finished turns worth sending back. An answer that claimed a card but made none (and the
 * question before it) is left out, so the model can't learn to talk instead of act.
 */
function usefulHistory(messages: ChatMessage[]): ChatMessage[] {
	const done = messages.filter((m) => m.status === "done" && m.text);
	const keep: ChatMessage[] = [];
	for (const [i, m] of done.entries()) {
		const next = done[i + 1];
		const fake = (x: ChatMessage | undefined) =>
			x?.role === "assistant" &&
			!x.drafts?.length &&
			!x.actions?.length &&
			CLAIMS_A_CARD.test(x.text);
		if (fake(m) || (m.role === "user" && fake(next))) continue;
		keep.push(m);
	}
	return keep;
}

function historyText(m: ChatMessage): string {
	const kinds = [
		...(m.drafts?.length ? ["propose_expenses"] : []),
		...(m.actions ?? []).map((a) =>
			a.action.kind === "deposit"
				? "propose_goal_deposit"
				: `propose_${a.action.kind}`,
		),
	];
	if (kinds.length)
		return `${m.text}\n(This answer's card came from calling ${[...new Set(kinds)].join(", ")}.)`.slice(
			0,
			4000,
		);
	return m.text.slice(0, 1500);
}

/**
 * One Ask Spendid conversation. It's cached on this device for an instant start and saved to
 * the person's account, so New chat keeps earlier chats in History on every device.
 */
export function useAskChat(userId: string) {
	const key = `spendid-ask:${userId}`;
	const currentKey = `spendid-ask-current:${userId}`;
	const queryClient = useQueryClient();
	// Whether this device already knew its open chat (if not, its cache predates saved chats).
	const hadThreadId = useRef(hasStoredId(currentKey));
	const [threadId, setThreadId] = useState(() => readCurrentId(currentKey));
	const [messages, setMessages] = useState<ChatMessage[]>(() => load(key));
	const [saveFailed, setSaveFailed] = useState(false);
	const controller = useRef<AbortController | null>(null);
	// Only changes made here are saved: opening or deleting a chat must never re-save it.
	const dirty = useRef(false);
	const busy = messages.at(-1)?.status === "streaming";

	useEffect(() => save(key, messages), [key, messages]);
	useEffect(() => writeCurrentId(currentKey, threadId), [currentKey, threadId]);

	// On load: a chat cached before chats were saved to the account is kept, once. A chat
	// that's gone from the account (deleted here or on another device) is let go, not revived.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only on first mount
	useEffect(() => {
		if (messages.length === 0) return;
		askThreadsApi.get(threadId).catch((error: unknown) => {
			if (!(error instanceof ApiError && error.status === 404)) return;
			if (hadThreadId.current) {
				dirty.current = false;
				setMessages([]);
				setThreadId(uuid());
			} else {
				dirty.current = true;
				setMessages((ms) => [...ms]);
			}
		});
	}, []);

	// Save finished chats to the account, shortly after the last change.
	useEffect(() => {
		if (busy || messages.length === 0 || !dirty.current) return;
		const timer = setTimeout(() => {
			if (!dirty.current) return;
			dirty.current = false;
			askThreadsApi
				.save(threadId, toStored(messages))
				.then(() => {
					setSaveFailed(false);
					return queryClient.invalidateQueries({
						queryKey: THREADS_KEY,
					});
				})
				.catch(() => setSaveFailed(true));
		}, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [busy, messages, threadId, queryClient]);
	// No abort on unmount: React may mount twice in development, and leaving mid-answer
	// should simply let it finish. The Stop button cancels on purpose.

	const patchLast = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
		dirty.current = true;
		setMessages((ms) => [...ms.slice(0, -1), fn(ms.at(-1) as ChatMessage)]);
	}, []);

	const send = useCallback(
		async (question: string, tone?: "roast" | "hype") => {
			const q = question.trim();
			if (!q || busy) return;
			const history = usefulHistory(messages)
				.slice(-HISTORY_SENT)
				.map((m) => ({ role: m.role, text: historyText(m) }));
			const now = Date.now();
			dirty.current = true;
			setMessages((ms) => [
				...ms,
				{
					id: `u${now}`,
					role: "user",
					text: q,
					steps: [],
					charts: [],
					drafts: null,
					status: "done",
				},
				{
					id: `a${now}`,
					role: "assistant",
					text: "",
					steps: [],
					charts: [],
					drafts: null,
					status: "streaming",
				},
			]);
			const abort = new AbortController();
			controller.current = abort;
			try {
				await streamAsk(
					{ question: q, history, tone },
					(e) => {
						if (e.type === "step")
							patchLast((m) => ({ ...m, steps: [...m.steps, e.label] }));
						if (e.type === "token")
							patchLast((m) => ({ ...m, text: m.text + e.text }));
						if (e.type === "chart")
							patchLast((m) => ({ ...m, charts: [...m.charts, e.chart] }));
						if (e.type === "drafts")
							patchLast((m) => ({ ...m, drafts: e.drafts }));
						if (e.type === "actions")
							patchLast((m) => ({
								...m,
								actions: e.actions.map((action) => ({
									action,
									status: "ready" as const,
								})),
							}));
						if (e.type === "error")
							patchLast((m) => ({ ...m, text: e.message, status: "error" }));
						if (e.type === "done")
							patchLast((m) => ({
								...m,
								status: m.status === "error" ? "error" : "done",
							}));
					},
					abort.signal,
				);
				patchLast((m) =>
					m.status === "streaming"
						? {
								...m,
								status: abort.signal.aborted ? "done" : "error",
								text: m.text || "Stopped.",
							}
						: m,
				);
			} catch (error) {
				patchLast((m) => ({
					...m,
					status: "error",
					text:
						error instanceof Error
							? error.message
							: t("Something went wrong. Try again."),
				}));
			} finally {
				void queryClient.invalidateQueries({ queryKey: ["ai-status"] });
			}
		},
		[busy, messages, patchLast, queryClient],
	);

	const stop = useCallback(() => controller.current?.abort(), []);
	/** Starts a new chat; the current one stays in History. */
	const clear = useCallback(() => {
		controller.current?.abort();
		dirty.current = false;
		setMessages([]);
		setThreadId(uuid());
	}, []);
	/** Opens a saved chat from History. */
	const open = useCallback(async (id: string) => {
		controller.current?.abort();
		const thread = await askThreadsApi.get(id);
		dirty.current = false;
		setThreadId(thread.id);
		setMessages(thread.messages as ChatMessage[]);
	}, []);
	/** Deletes a saved chat; deleting the open one starts a new chat. */
	const remove = useCallback(
		async (id: string) => {
			if (id === threadId) {
				// Leave the chat first, so nothing can save it again while it's deleted.
				controller.current?.abort();
				dirty.current = false;
				setMessages([]);
				setThreadId(uuid());
			}
			await askThreadsApi.remove(id);
			await queryClient.invalidateQueries({ queryKey: THREADS_KEY });
		},
		[queryClient, threadId],
	);
	const markDraftsSaved = useCallback((id: string) => {
		dirty.current = true;
		setMessages((ms) =>
			ms.map((m) => (m.id === id ? { ...m, drafts: [] } : m)),
		);
	}, []);

	const resolveAction = useCallback(
		(id: string, index: number, status: ActionStatus) => {
			dirty.current = true;
			setMessages((ms) =>
				ms.map((m) =>
					m.id === id && m.actions
						? {
								...m,
								actions: m.actions.map((a, i) =>
									i === index ? { ...a, status } : a,
								),
							}
						: m,
				),
			);
		},
		[],
	);

	return {
		threadId,
		messages,
		busy,
		saveFailed,
		send,
		stop,
		clear,
		open,
		remove,
		markDraftsSaved,
		resolveAction,
	};
}
