import type { EventEmitter } from "node:events";

export type ErrorLog = (message: string, err: unknown) => void;

type Emitter = Pick<EventEmitter, "on">;

/** A plain logger for processes without pino: one line on stderr, with the stack. */
export function stderrLog(prefix: string): ErrorLog {
	return (message, err) =>
		process.stderr.write(
			`[${prefix}] ${message}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
		);
}

/**
 * Logs "error" events from Redis connections, queues and workers. Without a listener,
 * Node turns one dropped connection into a crash.
 */
export function logErrors(
	label: string,
	log: ErrorLog,
	...emitters: Emitter[]
): void {
	for (const e of emitters) e.on("error", (err) => log(`${label} error`, err));
}

/**
 * The last line of defence. A stray rejection is logged and the process keeps serving;
 * an uncaught exception may have left things half-done, so it exits and Docker restarts it.
 */
export function guardProcess(
	log: ErrorLog,
	{
		proc = process,
		exit = (code: number) => process.exit(code),
	}: { proc?: Emitter; exit?: (code: number) => void } = {},
): void {
	proc.on("unhandledRejection", (reason) => log("unhandled rejection", reason));
	proc.on("uncaughtException", (err) => {
		log("uncaught exception", err);
		exit(1);
	});
}
