import {
	type ApiResponse,
	type VoiceResult,
	VoiceResultSchema,
} from "@spendid/shared";
import type { MotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { joinSegments } from "./segments";
import { downmix, level, toWav, WAV_RATE } from "./wav";

export type VoicePhase =
	| { kind: "idle" }
	| { kind: "starting" }
	| { kind: "listening"; hearing: boolean }
	| { kind: "reading" }
	| { kind: "review"; result: VoiceResult }
	| { kind: "error"; message: string };

const MAX_MS = 60_000;
/** After speech stops, wait this long for more ("grab 15… coffee 6…") before sending. */
const GRACE_MS = 900;

interface Session {
	stop: () => void;
	destroy: () => void;
}

async function upload(wav: Blob): Promise<VoiceResult> {
	let res: Response;
	try {
		res = await fetch("/api/capture/voice", {
			method: "POST",
			headers: { "Content-Type": "audio/wav" },
			body: wav,
		});
	} catch {
		throw new Error(
			t("Couldn't reach Spendid. Check your connection and try again."),
		);
	}
	const body = (await res
		.json()
		.catch(() => null)) as ApiResponse<VoiceResult> | null;
	if (!body) throw new Error(t("Spendid sent an unexpected reply. Try again."));
	if (!body.success) throw new Error(body.error);
	return VoiceResultSchema.parse(body.data);
}

function micMessage(error: unknown): string {
	const name = error instanceof DOMException ? error.name : "";
	if (name === "NotAllowedError")
		return t(
			"Spendid needs your microphone. Allow it in your browser's site settings, then try again.",
		);
	if (name === "NotFoundError")
		return t("No microphone found. Plug one in, or type it instead.");
	return t("Voice isn't available in this browser. Type it instead.");
}

/**
 * Tap, talk, done. Silero VAD (in the browser) notices speech; short pauses between items
 * are kept in the same note, which goes to ILMU once you stop or tap Done.
 * Falls back to a plain recorder with a Done button if the VAD can't load.
 */
export function useVoiceCapture(loudness: MotionValue<number>) {
	const [phase, setPhase] = useState<VoicePhase>({ kind: "idle" });
	const session = useRef<Session | null>(null);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const sent = useRef(false);

	const clearTimers = useCallback(() => {
		for (const t of timers.current) clearTimeout(t);
		timers.current = [];
	}, []);

	const cleanup = useCallback(() => {
		clearTimers();
		session.current?.destroy();
		session.current = null;
		loudness.set(0);
	}, [clearTimers, loudness]);

	/** Sends the note exactly once per recording. */
	const finish = useCallback(
		async (samples: Float32Array, rate: number) => {
			if (sent.current) return;
			sent.current = true;
			cleanup();
			if (samples.length < rate * 0.3) {
				setPhase({
					kind: "error",
					message: t("We didn't hear anything. Tap the mic and try again."),
				});
				return;
			}
			setPhase({ kind: "reading" });
			try {
				setPhase({
					kind: "review",
					result: await upload(toWav(samples, rate)),
				});
			} catch (error) {
				setPhase({
					kind: "error",
					message:
						error instanceof Error
							? error.message
							: t("Couldn't read that. Try again."),
				});
			}
		},
		[cleanup],
	);

	const startRecorderFallback = useCallback(async () => {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: true, noiseSuppression: true },
		});
		const recorder = new MediaRecorder(stream);
		const chunks: Blob[] = [];
		const ctx = new AudioContext();
		const analyser = ctx.createAnalyser();
		ctx.createMediaStreamSource(stream).connect(analyser);
		const frame = new Float32Array(analyser.fftSize);
		let raf = 0;
		const tick = () => {
			analyser.getFloatTimeDomainData(frame);
			loudness.set(level(frame));
			raf = requestAnimationFrame(tick);
		};
		tick();
		recorder.ondataavailable = (e) => chunks.push(e.data);
		recorder.onstop = async () => {
			const buffer = await ctx.decodeAudioData(
				await new Blob(chunks).arrayBuffer(),
			);
			const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
				buffer.getChannelData(i),
			);
			void finish(downmix(channels), buffer.sampleRate);
		};
		recorder.start();
		session.current = {
			stop: () => recorder.state !== "inactive" && recorder.stop(),
			destroy: () => {
				cancelAnimationFrame(raf);
				for (const t of stream.getTracks()) t.stop();
				void ctx.close();
			},
		};
		setPhase({ kind: "listening", hearing: true });
	}, [finish, loudness]);

	const start = useCallback(async () => {
		cleanup();
		sent.current = false;
		setPhase({ kind: "starting" });
		const segments: Float32Array[] = [];
		let hearing = false;
		const send = () => void finish(joinSegments(segments, WAV_RATE), WAV_RATE);

		try {
			const { MicVAD } = await import("@ricky0123/vad-web");
			const vad = await MicVAD.new({
				model: "v5",
				baseAssetPath: "/vad/",
				onnxWASMBasePath: "/vad/",
				positiveSpeechThreshold: 0.5,
				negativeSpeechThreshold: 0.35,
				redemptionMs: 1000,
				minSpeechMs: 250,
				preSpeechPadMs: 400,
				submitUserSpeechOnPause: true,
				// We call start() ourselves; starting on load too would open the mic twice.
				startOnLoad: false,
				onSpeechStart: () => {
					hearing = true;
					clearTimers();
					setPhase({ kind: "listening", hearing: true });
				},
				onVADMisfire: () => {
					hearing = false;
					setPhase({ kind: "listening", hearing: segments.length > 0 });
				},
				onSpeechEnd: (audio: Float32Array) => {
					hearing = false;
					segments.push(audio);
					timers.current.push(setTimeout(send, GRACE_MS));
				},
				onFrameProcessed: (_p: unknown, frame: Float32Array) =>
					loudness.set(level(frame)),
			});
			session.current = {
				stop: () => {
					if (hearing) {
						// Pausing submits the speech in progress; send right after it lands.
						void vad.pause().then(() => setTimeout(send, 50));
					} else if (segments.length > 0) {
						send();
					} else {
						cleanup();
						setPhase({
							kind: "error",
							message: t("We didn't hear anything. Tap the mic and try again."),
						});
					}
				},
				destroy: () => void vad.destroy(),
			};
			await vad.start();
			setPhase({ kind: "listening", hearing: false });
		} catch (error) {
			if (error instanceof DOMException) {
				setPhase({ kind: "error", message: micMessage(error) });
				return;
			}
			try {
				await startRecorderFallback();
			} catch (fallbackError) {
				setPhase({ kind: "error", message: micMessage(fallbackError) });
				return;
			}
		}
		timers.current.push(setTimeout(() => session.current?.stop(), MAX_MS));
	}, [cleanup, clearTimers, finish, loudness, startRecorderFallback]);

	const stop = useCallback(() => session.current?.stop(), []);
	const reset = useCallback(() => {
		cleanup();
		setPhase({ kind: "idle" });
	}, [cleanup]);

	useEffect(() => cleanup, [cleanup]);

	return { phase, start, stop, reset };
}
