/** JSON from a live event, or undefined when it isn't (a cut-off frame, a proxy's error page). */
export function parseEventData(data: string): unknown {
	try {
		return JSON.parse(data);
	} catch {
		return undefined;
	}
}

const MAX_DELAY_MS = 60_000;

/**
 * Wait before reconnecting after the `attempt`-th failure in a row: 1s, 2s, 4s… up to a
 * minute, between half and all of it, so many open apps don't retry in step.
 */
export function reconnectDelay(attempt: number, random = Math.random): number {
	const full = Math.min(MAX_DELAY_MS, 1_000 * 2 ** attempt);
	return Math.round(full * (0.5 + random() / 2));
}
