import type { ChartSpec, VoiceDraft } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamAsk } from "@/lib/ask-api";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	steps: string[];
	charts: ChartSpec[];
	drafts: VoiceDraft[] | null;
	status: "streaming" | "done" | "error";
}

const MAX_KEPT = 30;
const HISTORY_SENT = 8;

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

/** The conversation lives only on this device — the server keeps nothing. */
export function useAskChat(userId: string) {
	const key = `spendid-ask:${userId}`;
	const queryClient = useQueryClient();
	const [messages, setMessages] = useState<ChatMessage[]>(() => load(key));
	const controller = useRef<AbortController | null>(null);
	const busy = messages.at(-1)?.status === "streaming";

	useEffect(() => save(key, messages), [key, messages]);
	// No abort on unmount: React may mount twice in development, and leaving mid-answer
	// should simply let it finish. The Stop button cancels on purpose.

	const patchLast = useCallback(
		(fn: (m: ChatMessage) => ChatMessage) =>
			setMessages((ms) => [...ms.slice(0, -1), fn(ms.at(-1) as ChatMessage)]),
		[],
	);

	const send = useCallback(
		async (question: string) => {
			const q = question.trim();
			if (!q || busy) return;
			const history = messages
				.filter((m) => m.status === "done" && m.text)
				.slice(-HISTORY_SENT)
				.map((m) => ({ role: m.role, text: m.text }));
			const now = Date.now();
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
					{ question: q, history },
					(e) => {
						if (e.type === "step")
							patchLast((m) => ({ ...m, steps: [...m.steps, e.label] }));
						if (e.type === "token")
							patchLast((m) => ({ ...m, text: m.text + e.text }));
						if (e.type === "chart")
							patchLast((m) => ({ ...m, charts: [...m.charts, e.chart] }));
						if (e.type === "drafts")
							patchLast((m) => ({ ...m, drafts: e.drafts }));
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
							: "Something went wrong. Try again.",
				}));
			} finally {
				void queryClient.invalidateQueries({ queryKey: ["ai-status"] });
			}
		},
		[busy, messages, patchLast, queryClient],
	);

	const stop = useCallback(() => controller.current?.abort(), []);
	const clear = useCallback(() => {
		controller.current?.abort();
		setMessages([]);
	}, []);
	const markDraftsSaved = useCallback(
		(id: string) =>
			setMessages((ms) =>
				ms.map((m) => (m.id === id ? { ...m, drafts: [] } : m)),
			),
		[],
	);

	return { messages, busy, send, stop, clear, markDraftsSaved };
}
