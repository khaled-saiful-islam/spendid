/** An expected failure whose message is safe to show the person. HTTP layers use `statusCode`. */
export class ServiceError extends Error {
	constructor(
		readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = "ServiceError";
	}
}

export interface AiCallUsage {
	inputTokens: number;
	outputTokens: number;
	model: string;
}

/**
 * The model answered, but not in the shape asked for. The tokens were still spent (so
 * `usage` should be recorded), and asking again with the same input rarely helps.
 */
export class UnreadableAiAnswer extends ServiceError {
	constructor(readonly usage: AiCallUsage) {
		super(422, "The AI's answer didn't make sense this time.");
		this.name = "UnreadableAiAnswer";
	}
}
