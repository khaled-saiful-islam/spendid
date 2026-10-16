import type { AskEvent, AskRequest } from "@spendid/shared";

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
			"Couldn't reach Spendid. Check your connection and try again.",
			{ cause: error },
		);
	}
	if (!res.ok || !res.body) {
		const body = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(body?.error ?? "The assistant isn't available right now.");
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
			if (data) onEvent(JSON.parse(data.slice(6)) as AskEvent);
			cut = buffer.indexOf("\n\n");
		}
	}
}
