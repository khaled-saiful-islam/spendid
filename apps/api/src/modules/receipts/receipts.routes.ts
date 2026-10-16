import type { EventHub } from "@spendid/server";
import type { ReceiptSave } from "@spendid/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import { MAX_RECEIPT_BYTES, type ReceiptService } from "./receipts.service";

export interface ReceiptDeps {
	session: SessionLookup;
	receipts: ReceiptService;
	events: EventHub;
}

const IdParams = z.object({ id: z.uuid("Unknown receipt") });
const uid = (req: FastifyRequest): string => req.user?.id ?? "";
const HEARTBEAT_MS = 25_000;

export async function receiptRoutes(
	app: FastifyInstance,
	deps: ReceiptDeps,
): Promise<void> {
	app.addContentTypeParser(
		/^image\//,
		{ parseAs: "buffer", bodyLimit: MAX_RECEIPT_BYTES },
		(_req, body, done) => done(null, body),
	);
	app.addHook("preHandler", requireMember(deps.session));

	app.post(
		"/capture/receipt",
		{ bodyLimit: MAX_RECEIPT_BYTES },
		async (req, reply) => {
			const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
			req.log.debug({ bytes: body.byteLength }, "receipt body received");
			return reply.code(202).send({
				success: true,
				data: await deps.receipts.upload(uid(req), body),
			});
		},
	);

	app.get("/receipts", async (req) => ({
		success: true,
		data: await deps.receipts.pending(uid(req)),
	}));

	app.get("/receipts/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		return { success: true, data: await deps.receipts.get(uid(req), id) };
	});

	app.get("/receipts/:id/image", async (req, reply) => {
		const { id } = IdParams.parse(req.params);
		const { bytes, mime } = await deps.receipts.image(uid(req), id);
		return reply
			.header("Content-Type", mime)
			.header("Cache-Control", "private, max-age=3600")
			.send(bytes);
	});

	app.post("/receipts/:id/save", async (req, reply) => {
		const { id } = IdParams.parse(req.params);
		return reply.code(201).send({
			success: true,
			data: await deps.receipts.save(uid(req), id, req.body as ReceiptSave),
		});
	});

	app.delete("/receipts/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		await deps.receipts.discard(uid(req), id);
		return { success: true, data: null };
	});

	app.get("/warranties", async (req) => ({
		success: true,
		data: await deps.receipts.warranties(uid(req)),
	}));

	/** Server-sent events: live updates (receipt read, later family pulse) for this person only. */
	app.get("/events", (req, reply) => {
		reply.hijack();
		reply.raw.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});
		reply.raw.write("retry: 4000\n\n");
		const unsubscribe = deps.events.subscribe(uid(req), (event) => {
			const type = (event as { type?: string }).type ?? "message";
			reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
		});
		const heartbeat = setInterval(
			() => reply.raw.write(": keep-alive\n\n"),
			HEARTBEAT_MS,
		);
		req.raw.on("close", () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});
}
