import type {
	AskEvent,
	AskRequest,
	AskThread,
	AskThreadSummary,
	StoredAskMessage,
} from "@spendid/shared";
import { queryOptions } from "@tanstack/react-query";
import { t } from "@/i18n";
import { api } from "./http";
import { parseEventData } from "./sse";

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify(body ?? {}),
});

/** Saved chats, newest first; with a search, only the matching ones. */
export const threadsQuery = (q = "") =>
	queryOptions({
		queryKey: ["ask-threads", q],
		queryFn: () =>
			api<AskThreadSummary[]>(
				`/api/ask/threads${q ? `?q=${encodeURIComponent(q)}` : ""}`,
			),
		staleTime: 30_000,
	});

/** Every cached list of chats, for refreshing after a change. */
export const THREADS_KEY = ["ask-threads"] as const;

export const askThreadsApi = {
	get: (id: string) => api<AskThread>(`/api/ask/threads/${id}`),
	save: (id: string, messages: StoredAskMessage[]) =>
		api<AskThreadSummary>(`/api/ask/threads/${id}`, json("PUT", { messages })),
	remove: (id: string) => api<null>(`/api/ask/threads/${id}`, json("DELETE")),
};

/**
 * Sends a question and calls `onEvent` for each streamed event (steps, answer words,
 * charts, drafts). Resolves when the answer is complete.
 */
export async function streamAsk(
	request: AskRequest,
	onEvent: (e: AskEvent) => void,
	signal: AbortSignal,
): Promise<void> {
	let res: Response;
	try {
		res = await fetch("/api/ask", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(request),
			signal,
		});
	} catch (error) {
		if (signal.aborted) return;
		throw new Error(
			t("Couldn't reach Spendid. Check your connection and try again."),
			{ cause: error },
		);
	}
	if (!res.ok || !res.body) {
		const body = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(
			body?.error ?? t("The assistant isn't available right now."),
		);
	}

	const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;
		let cut = buffer.indexOf("\n\n");
		while (cut !== -1) {
			const frame = buffer.slice(0, cut);
			buffer = buffer.slice(cut + 2);
			const data = frame.split("\n").find((l) => l.startsWith("data: "));
			// A frame that isn't JSON is skipped rather than ending the answer.
			const event = data ? parseEventData(data.slice(6)) : undefined;
			if (event) onEvent(event as AskEvent);
			cut = buffer.indexOf("\n\n");
		}
	}
}
