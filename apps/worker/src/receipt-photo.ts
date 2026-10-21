import sharp from "sharp";

/** Longest side of a receipt photo kept after reading: still readable as proof for a warranty. */
export const KEEP_SIDE = 1200;
const KEEP_QUALITY = 72;

/**
 * A smaller copy of a receipt photo to keep once it has been read (the AI needed the full one).
 * Upright as taken, JPEG, at most KEEP_SIDE on its longest side. Null when the photo already is
 * one (never shrunk twice) or a copy wouldn't save at least a tenth of the space.
 */
export async function keepCopy(photo: Buffer): Promise<Buffer | null> {
	const meta = await sharp(photo, { failOn: "none" }).metadata();
	// Already a kept-size JPEG: compressing it again would only lose detail.
	if (
		meta.format === "jpeg" &&
		Math.max(meta.width ?? 0, meta.height ?? 0) <= KEEP_SIDE
	)
		return null;
	const small = await sharp(photo, { failOn: "none" })
		.rotate()
		.resize({
			width: KEEP_SIDE,
			height: KEEP_SIDE,
			fit: "inside",
			withoutEnlargement: true,
		})
		.jpeg({ quality: KEEP_QUALITY, mozjpeg: true })
		.toBuffer();
	return small.byteLength <= photo.byteLength * 0.9 ? small : null;
}
