/** One PNG as a single-page PDF the same shape as the image (pdf-lib loads only when used). */
export async function pngToPdf(png: Blob, title: string): Promise<Blob> {
	const { PDFDocument } = await import("pdf-lib");
	const pdf = await PDFDocument.create();
	pdf.setTitle(title);
	pdf.setCreator("Spendid");
	const image = await pdf.embedPng(await png.arrayBuffer());
	// 72 points an inch: keep the shape, at a print-friendly size.
	const width = 432;
	const height = (image.height / image.width) * width;
	const page = pdf.addPage([width, height]);
	page.drawImage(image, { x: 0, y: 0, width, height });
	const bytes = await pdf.save();
	return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** Saves a file through the browser's normal download. */
export function saveFile(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
