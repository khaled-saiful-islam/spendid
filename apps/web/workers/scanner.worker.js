/* global cv, importScripts, OffscreenCanvas */
/**
 * Receipt scanner, off the main thread. Plain JS because OpenCV.js is a classic script
 * that must be loaded with importScripts (module workers can't).
 *
 * Messages in:
 *   { type: "detect", id, bitmap }          small preview frame → corners of the receipt (0..1) or null
 *   { type: "crop", bitmap, points | null }  full-resolution frame → flattened JPEG Blob
 * Messages out: { type: "ready" } | { type: "quad", id, points } | { type: "cropped", blob, width, height } | { type: "error", message }
 */

importScripts("/cv/opencv.js");

const MAX_SIDE = 1800;

const ready = (async () => {
	let m = self.cv;
	if (m instanceof Promise || typeof m?.then === "function") m = await m;
	else if (!m?.Mat) await new Promise((resolve) => (m.onRuntimeInitialized = resolve));
	self.cv = m;
	self.postMessage({ type: "ready" });
})();

function readBitmap(bitmap) {
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Orders four points as top-left, top-right, bottom-right, bottom-left. */
function order(points) {
	const bySum = [...points].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
	const byDiff = [...points].sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
	return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

/** Largest convex four-sided shape covering at least 12% of the frame, else the largest rotated box. */
function findQuad(image) {
	const mats = [];
	const keep = (m) => (mats.push(m), m);
	try {
		const src = keep(cv.matFromImageData(image));
		const gray = keep(new cv.Mat());
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
		cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
		const edges = keep(new cv.Mat());
		cv.Canny(gray, edges, 40, 140);
		const kernel = keep(cv.Mat.ones(3, 3, cv.CV_8U));
		cv.dilate(edges, edges, kernel);
		const contours = keep(new cv.MatVector());
		const hierarchy = keep(new cv.Mat());
		cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

		const frameArea = image.width * image.height;
		let best = null;
		let bestArea = frameArea * 0.12;
		let largest = null;
		let largestArea = frameArea * 0.2;
		for (let i = 0; i < contours.size(); i++) {
			const c = contours.get(i);
			const area = cv.contourArea(c);
			if (area > largestArea) {
				largestArea = area;
				largest?.delete();
				largest = c.clone();
			}
			if (area > bestArea) {
				const approx = new cv.Mat();
				cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
				if (approx.rows === 4 && cv.isContourConvex(approx)) {
					bestArea = area;
					best = [];
					for (let p = 0; p < 4; p++) best.push([approx.data32S[p * 2], approx.data32S[p * 2 + 1]]);
				}
				approx.delete();
			}
			c.delete();
		}
		if (!best && largest) {
			const box = cv.minAreaRect(largest);
			best = cv.RotatedRect.points(box).map((p) => [p.x, p.y]);
		}
		largest?.delete();
		if (!best) return null;
		return order(best).map(([x, y]) => [x / image.width, y / image.height]);
	} finally {
		for (const m of mats) m.delete();
	}
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Flattens the receipt to a straight rectangle (or keeps the whole frame when no corners). */
async function crop(image, points) {
	const src = cv.matFromImageData(image);
	const out = new cv.Mat();
	try {
		let width;
		let height;
		if (points) {
			const px = points.map(([x, y]) => [x * image.width, y * image.height]);
			width = Math.max(dist(px[0], px[1]), dist(px[3], px[2]));
			height = Math.max(dist(px[0], px[3]), dist(px[1], px[2]));
			const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
			width = Math.round(width * scale);
			height = Math.round(height * scale);
			const from = cv.matFromArray(4, 1, cv.CV_32FC2, px.flat());
			const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
			const m = cv.getPerspectiveTransform(from, to);
			cv.warpPerspective(src, out, m, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
			from.delete();
			to.delete();
			m.delete();
		} else {
			const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
			width = Math.round(image.width * scale);
			height = Math.round(image.height * scale);
			cv.resize(src, out, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
		}
		const canvas = new OffscreenCanvas(width, height);
		canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(out.data), width, height), 0, 0);
		const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
		return { blob, width, height };
	} finally {
		src.delete();
		out.delete();
	}
}

self.onmessage = async (event) => {
	const msg = event.data;
	try {
		await ready;
		if (msg.type === "detect") {
			self.postMessage({ type: "quad", id: msg.id, points: findQuad(readBitmap(msg.bitmap)) });
		} else if (msg.type === "crop") {
			self.postMessage({ type: "cropped", ...(await crop(readBitmap(msg.bitmap), msg.points)) });
		}
	} catch (error) {
		self.postMessage({ type: "error", id: msg.id, message: String(error?.message ?? error) });
	}
};
