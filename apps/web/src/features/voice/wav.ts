/**
 * A voice note as a small WAV file: one channel, 16 kHz, 16-bit. Every speech-to-text
 * service reads WAV, and a minute of it is under 2 MB. Ported from Mentora's recorder.
 */

export const WAV_RATE = 16_000;

export function toWav(samples: Float32Array, sampleRate = WAV_RATE): Blob {
	return new Blob(
		[wavBytes(resample(samples, sampleRate, WAV_RATE), WAV_RATE)],
		{ type: "audio/wav" },
	);
}

export function wavBytes(samples: Float32Array, rate: number): ArrayBuffer {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const write = (at: number, text: string) => {
		for (let i = 0; i < text.length; i++)
			view.setUint8(at + i, text.charCodeAt(i));
	};
	write(0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	write(8, "WAVE");
	write(12, "fmt ");
	view.setUint32(16, 16, true); // chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true); // bytes per second
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	write(36, "data");
	view.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		view.setInt16(
			44 + i * 2,
			Math.max(-1, Math.min(1, samples[i] ?? 0)) * 0x7fff,
			true,
		);
	}
	return buffer;
}

/** Mixes channels down to mono. */
export function downmix(channels: Float32Array[]): Float32Array {
	const [first] = channels;
	if (!first) return new Float32Array();
	if (channels.length === 1) return first;
	const out = new Float32Array(first.length);
	for (const ch of channels)
		for (let i = 0; i < out.length; i++)
			out[i] = (out[i] ?? 0) + (ch[i] ?? 0) / channels.length;
	return out;
}

/** Linear interpolation: plenty for speech going to a recogniser. */
export function resample(
	input: Float32Array,
	from: number,
	to: number,
): Float32Array {
	if (from === to) return input;
	const length = Math.max(1, Math.round((input.length * to) / from));
	const out = new Float32Array(length);
	const step = from / to;
	for (let i = 0; i < length; i++) {
		const at = i * step;
		const low = Math.floor(at);
		const high = Math.min(input.length - 1, low + 1);
		const t = at - low;
		out[i] = (input[low] ?? 0) * (1 - t) + (input[high] ?? 0) * t;
	}
	return out;
}

/** Loudness of one frame, 0..1, for the listening animation. */
export function level(frame: Float32Array): number {
	let sum = 0;
	for (const s of frame) sum += s * s;
	return Math.min(1, Math.sqrt(sum / Math.max(1, frame.length)) * 6);
}
