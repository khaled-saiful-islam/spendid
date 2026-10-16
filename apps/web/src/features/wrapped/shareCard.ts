import { formatMinor, type Wrapped } from "@spendid/shared";
import { t } from "@/i18n";
import { monthName } from "@/lib/insights-api";

const W = 1080;
const H = 1350;

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
	ctx.fill();
}

/** Wraps `text` into lines no wider than `max` px. */
function lines(
	ctx: CanvasRenderingContext2D,
	text: string,
	max: number,
): string[] {
	const out: string[] = [];
	let line = "";
	for (const word of text.split(" ")) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width > max && line) {
			out.push(line);
			line = word;
		} else line = next;
	}
	if (line) out.push(line);
	return out;
}

/**
 * Draws the month as a 4:5 image to share. With `hideAmounts`, money becomes shares
 * ("38% on food") so nothing private leaves the phone.
 */
export async function drawShareCard(
	data: Wrapped,
	hideAmounts: boolean,
): Promise<Blob> {
	await document.fonts.ready;
	const canvas = document.createElement("canvas");
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error(t("Canvas isn't available."));

	const bg = ctx.createLinearGradient(0, 0, W, H);
	bg.addColorStop(0, "#4b2a7b");
	bg.addColorStop(0.55, "#7a4fc4");
	bg.addColorStop(1, "#ff5c7a");
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, W, H);

	// Pangolin-scale motif, like the app.
	ctx.strokeStyle = "rgba(255,255,255,0.07)";
	ctx.lineWidth = 3;
	for (let y = 0; y < H + 60; y += 60)
		for (let x = (y / 60) % 2 ? 0 : 40; x < W + 80; x += 80) {
			ctx.beginPath();
			ctx.arc(x, y, 40, 0, Math.PI);
			ctx.stroke();
		}

	const display = '"Bricolage Grotesque Variable", system-ui, sans-serif';
	const body = '"Figtree Variable", system-ui, sans-serif';
	ctx.fillStyle = "#ffb224";
	ctx.beginPath();
	ctx.arc(110, 120, 34, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#2a1446";
	ctx.font = `800 40px ${display}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("S", 110, 122);
	ctx.textAlign = "left";
	ctx.fillStyle = "#ffffff";
	ctx.font = `800 44px ${display}`;
	ctx.fillText("Spendid", 160, 122);

	ctx.textBaseline = "alphabetic";
	ctx.font = `600 44px ${body}`;
	ctx.fillStyle = "rgba(255,255,255,0.85)";
	ctx.fillText(
		`My ${monthName(data.month)}${data.inProgress ? " so far" : ""}`,
		80,
		270,
	);

	ctx.font = "150px system-ui, sans-serif";
	ctx.fillText(data.personality.emoji, 80, 450);
	ctx.fillStyle = "#ffffff";
	ctx.font = `800 92px ${display}`;
	let y = 580;
	for (const l of lines(ctx, data.personality.title, W - 160)) {
		ctx.fillText(l, 80, y);
		y += 100;
	}

	ctx.font = `500 40px ${body}`;
	ctx.fillStyle = "rgba(255,255,255,0.9)";
	const headline = hideAmounts
		? `${data.count} expenses on ${data.activeDays} days, ${data.noSpendDays} no-spend days`
		: `${formatMinor(data.totalMinor, data.currency)} across ${data.count} expenses`;
	for (const l of lines(ctx, headline, W - 160)) {
		ctx.fillText(l, 80, y);
		y += 52;
	}

	y += 40;
	ctx.fillStyle = "rgba(255,255,255,0.14)";
	roundRect(
		ctx,
		60,
		y,
		W - 120,
		120 + data.categories.slice(0, 3).length * 96,
		40,
	);
	y += 80;
	ctx.fillStyle = "#ffffff";
	ctx.font = `700 40px ${display}`;
	ctx.fillText(t("Where it went"), 100, y);
	y += 30;
	for (const c of data.categories.slice(0, 3)) {
		y += 66;
		ctx.font = `600 36px ${body}`;
		ctx.fillStyle = "#ffffff";
		ctx.fillText(c.name, 100, y);
		ctx.textAlign = "right";
		ctx.fillText(
			hideAmounts
				? `${Math.round(c.share * 100)}%`
				: formatMinor(c.minor, data.currency),
			W - 100,
			y,
		);
		ctx.textAlign = "left";
		ctx.fillStyle = "rgba(255,255,255,0.25)";
		roundRect(ctx, 100, y + 14, W - 200, 12, 6);
		ctx.fillStyle = "#ffb224";
		roundRect(ctx, 100, y + 14, Math.max(12, (W - 200) * c.share), 12, 6);
		y += 30;
	}

	ctx.font = `500 34px ${body}`;
	ctx.fillStyle = "rgba(255,255,255,0.8)";
	ctx.fillText(t("Know what you can safely spend today."), 80, H - 80);

	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob ? resolve(blob) : reject(new Error(t("Couldn't draw the card."))),
			"image/png",
		),
	);
}
