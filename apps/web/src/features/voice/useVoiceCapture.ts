import {
	type ApiResponse,
	type VoiceDraft,
	type VoiceResult,
	VoiceResultSchema,
} from "@spendid/shared";
import type { MotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { buzz } from "@/lib/haptics";
import { joinSegments } from "./segments";
import { downmix, level, toWav, WAV_RATE } from "./wav";

export type VoicePhase =
	| { kind: "idle" }
	| { kind: "starting" }
	| { kind: "listening"; hearing: boolean }
	/** Done was tapped; the last phrases are still being read. */
	| { kind: "finishing" }
	| { kind: "reading" }
	| { kind: "review"; result: VoiceResult }
	| { kind: "error"; message: string };

/** What has been understood so far while the person keeps talking. */
export interface LiveNote {
	drafts: VoiceDraft[];
	heard: string[];
	working: boolean;
	missed: boolean;
}

const EMPTY_LIVE: LiveNote = {
	drafts: [],
	heard: [],
	working: false,
	missed: false,
};
const MAX_MS = 120_000;
/** Quiet this long after the last phrase (and nothing left to read) ends the note by itself. */
const AUTO_DONE_MS = 8_000;
/** A phrase with no amount waits for the next one ("grab… fifteen"), at most this many. */
const MAX_CARRY = 3;

interface Session {
	stop: () => void;
	destroy: () => void;
}

class NoWordsError extends Error {}

async function upload(wav: Blob, earlier = ""): Promise<VoiceResult> {
	const query = earlier
		? `?context=${encodeURIComponent(earlier.slice(-600))}`
		: "";
	let res: Response;
	try {
		res = await fetch(`/api/capture/voice${query}`, {
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
	if (!body.success) {
		if (res.status === 422) throw new NoWordsError(body.error);
		throw new Error(body.error);
	}
	return VoiceResultSchema.parse(body.data);
}

function micMessage(error: unknown): string {
	// Browsers only allow the mic on https (or localhost); a phone on a Wi-Fi test address is neither.
	if (!window.isSecureContext)
		return t(
			"Voice needs a secure (https) address, and this one isn't. Type it for now, or open Spendid from its https address.",
		);
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
 * Tap and talk as long as you like. Silero VAD (in the browser) cuts the note into phrases at
 * natural pauses; each phrase is read right away, so expenses appear while you're still
 * talking. A phrase without an amount waits for the next ("grab… fifteen"). Earlier words go
 * along as context, so "yesterday" said once still applies. Tap Done, or go quiet, to review.
 * Falls back to one plain recording if the VAD can't load.
 */
export function useVoiceCapture(loudness: MotionValue<number>) {
	const [phase, setPhase] = useState<VoicePhase>({ kind: "idle" });
	const [live, setLive] = useState<LiveNote>(EMPTY_LIVE);
	const session = useRef<Session | null>(null);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	// Kept apart from `timers`: talking again clears those, but never the overall cap.
	const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sent = useRef(false);

	const clearTimers = useCallback(() => {
		for (const t of timers.current) clearTimeout(t);
		timers.current = [];
	}, []);

	const cleanup = useCallback(() => {
		clearTimers();
		if (maxTimer.current) clearTimeout(maxTimer.current);
		maxTimer.current = null;
		session.current?.destroy();
		session.current = null;
		loudness.set(0);
	}, [clearTimers, loudness]);

	/** Fallback path: the whole recording read at once. */
	const finishWhole = useCallback(
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
						error instanceof Error && !(error instanceof NoWordsError)
							? error.message
							: t("We didn't hear anything. Tap the mic and try again."),
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
			void finishWhole(downmix(channels), buffer.sampleRate);
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
	}, [finishWhole, loudness]);

	const start = useCallback(async () => {
		cleanup();
		sent.current = false;
		setLive(EMPTY_LIVE);
		setPhase({ kind: "starting" });

		// Phrases are read one after another, so a phrase can wait for the next one.
		let queue: Promise<void> = Promise.resolve();
		let pending = 0;
		let carry: Float32Array[] = [];
		let carryText = "";
		let hearing = false;
		let stopping = false;
		const heard: string[] = [];
		const drafts: VoiceDraft[] = [];
		let quick = false;

		const show = (patch: Partial<LiveNote>) =>
			setLive({
				drafts: [...drafts],
				heard: [...heard],
				working: pending > 0,
				missed: false,
				...patch,
			});

		const review = () => {
			if (sent.current) return;
			sent.current = true;
			cleanup();
			if (carryText) heard.push(carryText);
			if (heard.length === 0 && drafts.length === 0) {
				setPhase({
					kind: "error",
					message: t("We didn't hear anything. Tap the mic and try again."),
				});
				return;
			}
			setPhase({
				kind: "review",
				result: {
					transcript: heard.join(" "),
					drafts,
					readBy: quick ? "quick" : "ai",
				},
			});
		};

		/** Ends the note once nothing is left to read. */
		const finishWhenRead = () => {
			stopping = true;
			setPhase({ kind: "finishing" });
			void queue.then(review);
		};

		const armAutoDone = () => {
			clearTimers();
			timers.current.push(
				setTimeout(() => {
					if (!hearing && (drafts.length > 0 || heard.length > 0))
						finishWhenRead();
				}, AUTO_DONE_MS),
			);
		};

		const readPhrase = (audio: Float32Array) => {
			pending += 1;
			show({});
			queue = queue.then(async () => {
				carry.push(audio);
				try {
					const result = await upload(
						toWav(joinSegments(carry, WAV_RATE), WAV_RATE),
						heard.join(" "),
					);
					quick ||= result.readBy === "quick";
					if (result.drafts.length > 0 || carry.length >= MAX_CARRY) {
						heard.push(result.transcript);
						drafts.push(...result.drafts);
						carry = [];
						carryText = "";
						if (result.drafts.length > 0) buzz("tap");
					} else {
						// No amount yet: keep this phrase and read it again with the next one.
						carryText = result.transcript;
					}
					pending -= 1;
					show({});
				} catch (error) {
					carry = [];
					pending -= 1;
					show({ missed: !(error instanceof NoWordsError) });
				}
				if (!stopping) armAutoDone();
			});
		};

		try {
			const { MicVAD } = await import("@ricky0123/vad-web");
			const vad = await MicVAD.new({
				model: "v5",
				baseAssetPath: "/vad/",
				onnxWASMBasePath: "/vad/",
				positiveSpeechThreshold: 0.5,
				negativeSpeechThreshold: 0.35,
				redemptionMs: 700,
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
					setPhase({ kind: "listening", hearing: false });
					armAutoDone();
				},
				onSpeechEnd: (audio: Float32Array) => {
					hearing = false;
					if (!stopping) setPhase({ kind: "listening", hearing: false });
					readPhrase(audio);
				},
				onFrameProcessed: (_p: unknown, frame: Float32Array) =>
					loudness.set(level(frame)),
			});
			session.current = {
				stop: () => {
					if (stopping) return;
					// Pausing submits any speech in progress as a last phrase.
					void vad.pause().then(() => setTimeout(finishWhenRead, 50));
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
		maxTimer.current = setTimeout(() => session.current?.stop(), MAX_MS);
	}, [cleanup, clearTimers, loudness, startRecorderFallback]);

	const stop = useCallback(() => session.current?.stop(), []);
	const reset = useCallback(() => {
		cleanup();
		setLive(EMPTY_LIVE);
		setPhase({ kind: "idle" });
	}, [cleanup]);

	useEffect(() => cleanup, [cleanup]);

	return { phase, live, start, stop, reset };
}
