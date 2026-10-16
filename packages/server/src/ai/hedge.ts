export interface HedgeOptions {
	/** Start one backup attempt if the first hasn't answered by then. */
	hedgeAfterMs: number;
	/** Give up entirely after this long. */
	deadlineMs: number;
}

/**
 * Tail-latency guard for upstream AI calls: occasionally one request stalls for 15–30 s
 * while an identical one answers in 2 s. Runs one attempt, adds a single backup when the
 * first is slow (or fails fast), returns the first success and aborts the rest.
 */
export function hedged<T>(
	run: (signal: AbortSignal) => Promise<T>,
	opts: HedgeOptions,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const controllers: AbortController[] = [];
		let failures = 0;
		let settled = false;
		let backupStarted = false;

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(hedgeTimer);
			clearTimeout(deadline);
			for (const c of controllers) c.abort();
			fn();
		};

		const attempt = () => {
			const controller = new AbortController();
			controllers.push(controller);
			run(controller.signal).then(
				(value) => finish(() => resolve(value)),
				(error: unknown) => {
					failures++;
					if (!backupStarted) {
						startBackup();
						return;
					}
					if (failures >= controllers.length) finish(() => reject(error));
				},
			);
		};

		const startBackup = () => {
			if (backupStarted || settled) return;
			backupStarted = true;
			attempt();
		};

		const hedgeTimer = setTimeout(startBackup, opts.hedgeAfterMs);
		const deadline = setTimeout(
			() => finish(() => reject(new Error("AI took too long"))),
			opts.deadlineMs,
		);
		attempt();
	});
}
