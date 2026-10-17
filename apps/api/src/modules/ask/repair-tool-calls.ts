import { jsonrepair } from "jsonrepair";
import { AIMessage } from "langchain";

interface InvalidCall {
	name?: string;
	args?: string;
	id?: string;
}

/**
 * Some models send tool arguments that are almost JSON (a missing quote, a doubled character).
 * LangChain then drops the call as "invalid". This repairs what can be repaired so the tool still
 * runs; the tool's own schema then decides whether the values make sense.
 */
export function repairToolCalls(message: AIMessage): AIMessage {
	const invalid = (message.invalid_tool_calls ?? []) as InvalidCall[];
	if (invalid.length === 0) return message;
	const fixed: {
		name: string;
		args: Record<string, unknown>;
		id: string;
		type: "tool_call";
	}[] = [];
	const stillInvalid: InvalidCall[] = [];
	for (const call of invalid) {
		const args = parseLoosely(call.args ?? "");
		if (call.name && args) {
			fixed.push({
				name: call.name,
				args,
				id: call.id ?? `repaired-${fixed.length}`,
				type: "tool_call",
			});
		} else {
			stillInvalid.push(call);
		}
	}
	if (fixed.length === 0) return message;
	return new AIMessage({
		id: message.id,
		content: message.content,
		additional_kwargs: message.additional_kwargs,
		response_metadata: message.response_metadata,
		usage_metadata: message.usage_metadata,
		tool_calls: [...(message.tool_calls ?? []), ...fixed],
		invalid_tool_calls: stillInvalid.map((c) => ({
			name: c.name,
			args: c.args,
			id: c.id,
			error: "Arguments could not be repaired.",
			type: "invalid_tool_call" as const,
		})),
	});
}

/**
 * The glitch seen from ILMU: a string value loses its opening quote and its last character is
 * doubled (`"laptop"` arrives as `laptopp"`, `"2027-06-30"` as `2027-06-300"`). Undo exactly that.
 */
export function undoDoubledEnding(raw: string): string {
	return raw
		.replace(
			/:\s*(?![\s"\d\-[{])(?!(?:true|false|null)\s*[,}])([^",{}[\]]*?)(\S)\2"/gu,
			(_m, head: string, last: string) => `: "${head}${last}"`,
		)
		.replace(
			/:\s*(\d[^",{}[\]\s]*?[-/][^",{}[\]\s]*?)(\d)\2"/g,
			(_m, head: string, last: string) => `: "${head}${last}"`,
		);
}

/** JSON.parse, then the known-glitch fix, then a general repair; an object or null. */
export function parseLoosely(raw: string): Record<string, unknown> | null {
	for (const attempt of [
		() => raw,
		() => undoDoubledEnding(raw),
		() => jsonrepair(undoDoubledEnding(raw)),
		() => jsonrepair(raw),
	]) {
		try {
			const value: unknown = JSON.parse(attempt());
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return value as Record<string, unknown>;
			}
		} catch {
			// Try the next way; null below means neither worked.
		}
	}
	return null;
}
