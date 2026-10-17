/** Longest side of the rendered receipt image, enough for the vision model to read small print. */
const TARGET_WIDTH = 1400;
const MAX_PAGES = 3;
const MAX_HEIGHT = 6000;

export const isPdf = (file: File): boolean =>
	file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

/**
 * Turns an e-receipt PDF into one JPEG: the first pages stacked top to bottom, so a long
 * receipt split over pages reads as one. pdf.js loads only when a PDF is picked.
 */
export async function pdfToImage(file: File): Promise<File> {
	const [pdfjs, worker] = await Promise.all([
		import("pdfjs-dist"),
		import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
	]);
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
	const task = pdfjs.getDocument({
		data: new Uint8Array(await file.arrayBuffer()),
	});
	const doc = await task.promise;
	try {
		const pages: HTMLCanvasElement[] = [];
		for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
			const page = await doc.getPage(n);
			const base = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(viewport.width);
			canvas.height = Math.round(viewport.height);
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Canvas isn't available.");
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			pages.push(canvas);
		}
		const height = Math.min(
			MAX_HEIGHT,
			pages.reduce((h, c) => h + c.height, 0),
		);
		const out = document.createElement("canvas");
		out.width = TARGET_WIDTH;
		out.height = height;
		const octx = out.getContext("2d");
		if (!octx) throw new Error("Canvas isn't available.");
		let y = 0;
		for (const c of pages) {
			if (y >= height) break;
			octx.drawImage(c, 0, y);
			y += c.height;
		}
		const blob = await new Promise<Blob | null>((resolve) =>
			out.toBlob(resolve, "image/jpeg", 0.9),
		);
		if (!blob) throw new Error("Couldn't read that PDF.");
		return new File([blob], file.name.replace(/\.pdf$/i, ".jpg"), {
			type: "image/jpeg",
		});
	} finally {
		void task.destroy();
	}
}
