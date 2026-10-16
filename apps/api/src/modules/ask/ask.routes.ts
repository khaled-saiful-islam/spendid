import type { AskEvent, AskRequest } from "@spendid/shared";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import type { AskAgent } from "./ask.agent";

export interface AskDeps {
	session: SessionLookup;
	ask: AskAgent;
}

function messageOf(error: unknown): string {
	if (error instanceof ZodError)
		return error.issues[0]?.message ?? "Check your question and try again.";
	const status = (error as { statusCode?: number }).statusCode;
	if (status && status < 500 && error instanceof Error) return error.message;
	return "The assistant had a problem answering. Try again in a moment.";
}

/** POST /api/ask — streams the assistant's progress and answer as server-sent events. */
export async function askRoutes(
	app: FastifyInstance,
	deps: AskDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));

	app.post("/ask", (req, reply) => {
		reply.hijack();
		reply.raw.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});
		const send = (event: AskEvent) =>
			reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
		const controller = new AbortController();
		req.raw.on("close", () => controller.abort());

		void (async () => {
			try {
				for await (const event of deps.ask(
					req.user?.id ?? "",
					req.body as AskRequest,
					controller.signal,
				)) {
					if (controller.signal.aborted) break;
					send(event);
				}
			} catch (error) {
				if (!controller.signal.aborted) {
					req.log.warn({ err: error }, "ask failed");
					send({ type: "error", message: messageOf(error) });
				}
			} finally {
				reply.raw.end();
			}
		})();
	});
}
