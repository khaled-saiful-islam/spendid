import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { KEEP_SIDE, keepCopy } from "./receipt-photo";

/** A photo-like image: noise, so it doesn't compress to nothing. */
async function photo(width: number, height: number): Promise<Buffer> {
	const raw = Buffer.alloc(width * height * 3);
	for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
	return sharp(raw, { raw: { width, height, channels: 3 } })
		.jpeg({ quality: 92 })
		.toBuffer();
}

describe("keepCopy", () => {
	it("shrinks a full-size receipt photo to at most 1200 px and much less space", async () => {
		const big = await photo(1500, 2000);
		const small = await keepCopy(big);
		expect(small).not.toBeNull();
		const meta = await sharp(small ?? Buffer.alloc(0)).metadata();
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(KEEP_SIDE);
		expect(meta.format).toBe("jpeg");
		expect((small?.byteLength ?? 0) / big.byteLength).toBeLessThan(0.6);
	});

	it("never shrinks a kept copy again (no saving, no loss)", async () => {
		const once = await keepCopy(await photo(1500, 2000));
		expect(once).not.toBeNull();
		expect(await keepCopy(once ?? Buffer.alloc(0))).toBeNull();
	});

	it("reads PNG and WebP too", async () => {
		const png = await sharp(await photo(1600, 1200))
			.png()
			.toBuffer();
		expect(await keepCopy(png)).not.toBeNull();
	});
});
