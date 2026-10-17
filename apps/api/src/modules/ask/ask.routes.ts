import type { AskEvent, AskRequest } from "@spendid/shared";
import type { FastifyInstance } from "fastify";
import { ZodError, z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import { notFound } from "../../http/app-error";
import type { AskAgent } from "./ask.agent";
import type { ThreadRepository } from "./threads.repository";

export interface AskDeps {
	session: SessionLookup;
	ask: AskAgent;
	threads: ThreadRepository;
}

const IdParams = z.object({ id: z.uuid("Unknown chat") });

function messageOf(error: unknown): string {
	if (error instanceof ZodError)
		return error.issues[0]?.message ?? "Check your question and try again.";
	const status = (error as { statusCode?: number }).statusCode;
	if (status && status < 500 && error instanceof Error) return error.message;
	return "The assistant had a problem answering. Try again in a moment.";
}

/**
 * POST /api/ask — streams the assistant's progress and answer as server-sent events.
 * /api/ask/threads — the person's saved chats (list, open, save, delete).
 */
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

	app.get("/ask/threads", async (req) => ({
		success: true,
		data: await deps.threads.list(
			req.user?.id ?? "",
			z.object({ q: z.string().max(80).optional() }).parse(req.query).q,
		),
	}));

	app.get("/ask/threads/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		const thread = await deps.threads.get(req.user?.id ?? "", id);
		if (!thread) throw notFound("Chat");
		return { success: true, data: thread };
	});

	app.put("/ask/threads/:id", { bodyLimit: 512 * 1024 }, async (req) => {
		const { id } = IdParams.parse(req.params);
		const saved = await deps.threads.save(req.user?.id ?? "", id, req.body);
		if (!saved) throw notFound("Chat");
		return { success: true, data: saved };
	});

	app.delete("/ask/threads/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		if (!(await deps.threads.remove(req.user?.id ?? "", id)))
			throw notFound("Chat");
		return { success: true, data: null };
	});
}
