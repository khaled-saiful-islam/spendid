import { Redis } from "ioredis";
import { type ErrorLog, logErrors } from "../process";

export type Listener = (event: unknown) => void;

const channel = (userId: string) => `user:${userId}`;

/** Publishes a live update to every app the person has open. */
export function createPublisher(redis: Redis) {
	return (userId: string, event: unknown): Promise<number> => redis.publish(channel(userId), JSON.stringify(event));
}

/**
 * One Redis subscription for the whole API process (pattern `user:*`), fanned out to
 * in-memory listeners — so a thousand open apps don't mean a thousand Redis connections.
 */
export function createEventHub(redisUrl: string, logError: ErrorLog) {
	const sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
	logErrors("live updates", logError, sub);
	const listeners = new Map<string, Set<Listener>>();
	void sub.psubscribe("user:*");
	sub.on("pmessage", (_pattern, ch, message) => {
		const set = listeners.get(ch);
		if (!set) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(message);
		} catch {
			return;
		}
		for (const l of set) l(parsed);
	});

	return {
		subscribe(userId: string, listener: Listener): () => void {
			const ch = channel(userId);
			const set = listeners.get(ch) ?? new Set<Listener>();
			set.add(listener);
			listeners.set(ch, set);
			return () => {
				set.delete(listener);
				if (set.size === 0) listeners.delete(ch);
			};
		},
		close: async (): Promise<void> => {
			await sub.quit();
		},
	};
}

export type EventHub = ReturnType<typeof createEventHub>;
