import { z } from "zod";
import { AppError } from "../http/app-error";

export interface Transcript {
	text: string;
	seconds: number;
}

export interface Transcriber {
	transcribe(
		audio: Buffer,
		opts: { mime: string; language: string },
	): Promise<Transcript>;
}

const ReplySchema = z.object({
	text: z.string().default(""),
	usage: z.object({ seconds: z.number().optional() }).partial().optional(),
});

/**
 * ILMU speech-to-text over the OpenAI `/audio/transcriptions` shape.
 * The clip is sent and forgotten — Spendid never stores anyone's voice.
 */
export function createTranscriber(cfg: {
	baseUrl: string;
	apiKey: string;
	model: string;
}): Transcriber {
	return {
		async transcribe(audio, { mime, language }) {
			const form = new FormData();
			form.set("model", cfg.model);
			form.set("language", language);
			form.set(
				"file",
				new Blob([new Uint8Array(audio)], { type: mime }),
				mime.includes("wav") ? "speech.wav" : "speech.webm",
			);

			let res: Response;
			try {
				res = await fetch(
					`${cfg.baseUrl.replace(/\/$/, "")}/audio/transcriptions`,
					{
						method: "POST",
						headers: { Authorization: `Bearer ${cfg.apiKey}` },
						body: form,
						signal: AbortSignal.timeout(30_000),
					},
				);
			} catch {
				throw new AppError(
					502,
					"Listening isn't working just now. Try again, or type it.",
				);
			}
			if (!res.ok)
				throw new AppError(
					502,
					"We couldn't hear that. Try again, or type it.",
				);
			const reply = ReplySchema.safeParse(await res.json().catch(() => null));
			if (!reply.success)
				throw new AppError(
					502,
					"We couldn't hear that. Try again, or type it.",
				);
			return {
				text: reply.data.text.split(/\s+/).join(" ").trim(),
				seconds: reply.data.usage?.seconds ?? audio.byteLength / 32_000,
			};
		},
	};
}
