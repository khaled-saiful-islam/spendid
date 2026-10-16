import { describe, expect, it } from "vitest";
import { downmix, level, resample, WAV_RATE, wavBytes } from "./wav";

describe("wavBytes", () => {
	it("writes a valid 16 kHz mono PCM header", () => {
		const view = new DataView(wavBytes(new Float32Array(160), WAV_RATE));
		const tag = (at: number) =>
			String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)));
		expect(tag(0)).toBe("RIFF");
		expect(tag(8)).toBe("WAVE");
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint32(40, true)).toBe(320);
	});

	it("clips samples beyond full scale", () => {
		const view = new DataView(wavBytes(Float32Array.from([2, -2]), WAV_RATE));
		expect(view.getInt16(44, true)).toBe(0x7fff);
		expect(view.getInt16(46, true)).toBe(-0x7fff);
	});
});

describe("resample / downmix / level", () => {
	it("halves the sample count going 32 kHz → 16 kHz", () => {
		expect(resample(new Float32Array(3200), 32_000, 16_000)).toHaveLength(1600);
	});

	it("averages channels", () => {
		expect([
			...downmix([Float32Array.from([1, 0]), Float32Array.from([0, 0])]),
		]).toEqual([0.5, 0]);
	});

	it("reports silence as zero and loud speech near one", () => {
		expect(level(new Float32Array(512))).toBe(0);
		expect(level(new Float32Array(512).fill(0.5))).toBe(1);
	});
});
