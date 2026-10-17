import type { AiGuard } from "@spendid/server";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import { badRequest } from "../../http/app-error";
import type { VoiceService } from "./voice.service";

/** Earlier words from the same note, when a long note arrives phrase by phrase. */
const VoiceQuery = z.object({ context: z.string().max(600).optional() });

/** About a minute of 16 kHz mono WAV, with headroom for compressed fallbacks. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MIN_AUDIO_BYTES = 8_000;

export interface CaptureDeps {
	session: SessionLookup;
	voice: VoiceService;
	guard: AiGuard;
}

export async function captureRoutes(
	app: FastifyInstance,
	deps: CaptureDeps,
): Promise<void> {
	app.addContentTypeParser(
		/^audio\//,
		{ parseAs: "buffer", bodyLimit: MAX_AUDIO_BYTES },
		(_req, body, done) => done(null, body),
	);
	app.addHook("preHandler", requireMember(deps.session));

	app.post("/capture/voice", { bodyLimit: MAX_AUDIO_BYTES }, async (req) => {
		const audio = req.body;
		if (!Buffer.isBuffer(audio) || audio.byteLength < MIN_AUDIO_BYTES) {
			throw badRequest(
				"That recording was too short. Hold on a moment longer and try again.",
			);
		}
		const mime =
			(req.headers["content-type"] ?? "audio/wav").split(";")[0] ?? "audio/wav";
		return {
			success: true,
			data: await deps.voice.read(
				req.user?.id ?? "",
				audio,
				mime,
				req.log,
				VoiceQuery.parse(req.query).context,
			),
		};
	});

	app.get("/ai/status", async (req) => ({
		success: true,
		data: await deps.guard.status(req.user?.id ?? ""),
	}));

	app.get("/ai/usage", async (req) => ({
		success: true,
		data: await deps.guard.usage(req.user?.id ?? ""),
	}));
}
