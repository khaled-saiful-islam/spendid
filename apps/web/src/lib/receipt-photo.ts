import { isPdf, pdfToImage } from "./pdf-to-image";

/** Long side of an uploaded receipt photo: plenty to read small print, well under the size limit. */
const MAX_SIDE = 2000;

/**
 * A picked receipt (photo, screenshot or PDF) as a JPEG ready to upload. PDFs become one tall
 * image; big photos are scaled down and turned upright. The scanner straightens camera shots;
 * a picked photo is used as it is.
 */
export async function receiptPhoto(file: File): Promise<Blob> {
	if (isPdf(file)) return pdfToImage(file);
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	});
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error("Couldn't prepare that photo.")),
			"image/jpeg",
			0.85,
		),
	);
}
