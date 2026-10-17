import type { ServerResponse } from "node:http";
import type { FastifyInstance, FastifyReply } from "fastify";

declare module "fastify" {
	interface FastifyInstance {
		streams: Set<ServerResponse>;
	}
}

/** Tracks open event streams, and ends them when the server closes. */
export function registerStreams(app: FastifyInstance): void {
	const streams = new Set<ServerResponse>();
	app.decorate("streams", streams);
	// A stream never finishes on its own, so close() would wait for it forever.
	app.addHook("preClose", (done) => {
		for (const res of streams) res.end();
		streams.clear();
		done();
	});
}

/**
 * Opens a server-sent events stream. `onClose` runs once, when the person leaves or the
 * server shuts down. Returns a writer that ignores writes after the stream has ended.
 */
export function openStream(
	reply: FastifyReply,
	onClose: () => void,
): (chunk: string) => void {
	reply.hijack();
	const res = reply.raw;
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	const streams = reply.server.streams;
	streams.add(res);
	// The response's close (not the request's) fires when the connection goes away.
	res.once("close", () => {
		streams.delete(res);
		onClose();
	});
	return (chunk) => {
		if (!res.writableEnded && !res.destroyed) res.write(chunk);
	};
}
