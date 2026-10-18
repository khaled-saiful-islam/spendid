import { useEffect, useRef, useState } from "react";

/** Seconds before each automatic retry: quick at first, then calmer. */
const DELAYS_S = [5, 10, 20, 30];

export function retryDelay(attempt: number): number {
	return DELAYS_S[Math.min(attempt, DELAYS_S.length - 1)] ?? 30;
}

/**
 * Retries by itself on a countdown while the device is online, and straight away when the
 * connection comes back. Returns the seconds left and the full wait (null while offline or
 * busy), so the page can show the countdown.
 */
export function useAutoRetry(
	retry: () => Promise<void>,
	online: boolean,
	busy: boolean,
): { left: number | null; total: number; attempt: number } {
	const [attempt, setAttempt] = useState(0);
	const [left, setLeft] = useState<number | null>(null);
	const total = retryDelay(attempt);
	const wasOnline = useRef(online);

	useEffect(() => {
		const cameBack = online && !wasOnline.current;
		wasOnline.current = online;
		if (cameBack && !busy) void retry();
	}, [online, busy, retry]);

	useEffect(() => {
		if (!online || busy) {
			setLeft(null);
			return;
		}
		const started = Date.now();
		setLeft(total);
		const timer = window.setInterval(() => {
			const remaining = total - Math.floor((Date.now() - started) / 1000);
			if (remaining > 0) return setLeft(remaining);
			window.clearInterval(timer);
			setAttempt((a) => a + 1);
			void retry();
		}, 250);
		return () => window.clearInterval(timer);
	}, [online, busy, total, retry]);

	return { left, total, attempt };
}
