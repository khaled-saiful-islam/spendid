import { ChatOpenAI } from "@langchain/openai";
import {
	type ReceiptDraft,
	SYSTEM_CATEGORIES,
	splitQuantity,
	toMinor,
} from "@spendid/shared";
import { z } from "zod";
import { hedged } from "./hedge";
import { structuredResult } from "./structured";

const SLUGS = SYSTEM_CATEGORIES.map((c) => c.slug) as [string, ...string[]];
const KNOWN = new Set(Intl.supportedValuesOf("currency"));

const ReadSchema = z.object({
	merchant: z.string().describe("Shop name as printed"),
	date: z
		.string()
		.nullable()
		.describe("Purchase date YYYY-MM-DD, null if not visible"),
	currency: z
		.string()
		.nullable()
		.describe("ISO code, e.g. RM = MYR; null if unclear"),
	total: z
		.number()
		.min(0)
		.describe("Final amount paid, after tax and discounts"),
	tax: z.number().min(0).nullable(),
	category: z
		.enum(SLUGS)
		.describe("Best single category for the whole receipt"),
	items: z
		.array(
			z.object({
				name: z.string(),
				quantity: z.number().positive().nullable(),
				lineTotal: z.number().min(0),
				warrantyMonths: z.number().int().min(1).max(120).nullable(),
			}),
		)
		.max(200),
});

const SYSTEM = `Read the receipt in the photo and record it exactly as printed.
- merchant: the shop name. date: purchase date as YYYY-MM-DD, or null if not printed or unclear. Receipts here print the day first: 02/10/2026, 02-10-26 or 02.10.2026 is 2 October 2026. A purchase is never after today.
- currency: from symbols or text (RM = MYR, S$ = SGD); null if unclear.
- total: the final amount paid. tax: the tax line if shown.
- items: every purchased line with its line total. If a line shows a quantity ("x2", "2 @ 6.90"), set quantity and drop it from the name. Skip subtotal, tax, payment, rounding and change lines.
- warrantyMonths: only for items the receipt says carry a warranty.
- If the photo is not a receipt, return total 0 and no items.`;

export interface ReceiptReading {
	draft: ReceiptDraft;
	inputTokens: number;
	outputTokens: number;
	model: string;
}

export type ReceiptReader = (
	image: Buffer,
	mime: string,
	homeCurrency: string,
	/** The person's own calendar day, YYYY-MM-DD. */
	today: string,
) => Promise<ReceiptReading>;

/** A real calendar day, YYYY-MM-DD. */
function realDay(y: number, m: number, d: number): string | null {
	const at = new Date(Date.UTC(y, m - 1, d));
	if (
		at.getUTCFullYear() !== y ||
		at.getUTCMonth() !== m - 1 ||
		at.getUTCDate() !== d
	)
		return null;
	return at.toISOString().slice(0, 10);
}

/**
 * The purchase day, or null when it can't be right: not a real date, or after today. A future
 * date that is a real past day with day and month swapped was read the wrong way round.
 */
export function purchaseDay(raw: string | null, today?: string): string | null {
	const m = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const day = realDay(y, mo, d);
	if (!day || !today || day <= today) return day;
	const swapped = realDay(y, d, mo);
	return swapped && swapped <= today ? swapped : null;
}

/** "XIAOMI POWER BANK 20K" → "Xiaomi Power Bank 20K": words with digits (sizes, models) keep their case. */
const titleCase = (s: string) =>
	s
		.trim()
		.split(/\s+/)
		.map((w) =>
			/\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
		)
		.join(" ");

/** Raw model output (major units) → a draft in minor units. */
export function toDraft(
	read: z.infer<typeof ReadSchema>,
	homeCurrency: string,
	today?: string,
): ReceiptDraft {
	const upper = read.currency?.toUpperCase();
	const currency = upper && KNOWN.has(upper) ? upper : homeCurrency;
	const date = purchaseDay(read.date, today);
	return {
		merchant: titleCase(read.merchant) || "Receipt",
		date,
		currency,
		totalMinor: toMinor(read.total, currency),
		taxMinor: read.tax === null ? null : toMinor(read.tax, currency),
		categorySlug: read.category,
		items: read.items.map((item) => {
			const split = splitQuantity(item.name);
			// A multiplier printed in the name ("x2") beats the model's default of 1.
			const quantity =
				split.quantity > 1
					? split.quantity
					: item.quantity && item.quantity > 0
						? item.quantity
						: 1;
			const totalMinor = toMinor(item.lineTotal, currency);
			return {
				name: titleCase(split.name),
				quantity,
				unitPriceMinor: Math.round(totalMinor / quantity),
				totalMinor,
				warrantyMonths: item.warrantyMonths,
			};
		}),
	};
}

export function createReceiptReader(cfg: {
	baseUrl: string;
	apiKey: string;
	model: string;
}): ReceiptReader {
	const llm = new ChatOpenAI({
		model: cfg.model,
		apiKey: cfg.apiKey,
		temperature: 0,
		maxRetries: 0,
		configuration: { baseURL: cfg.baseUrl },
	});
	const structured = llm.withStructuredOutput(ReadSchema, {
		name: "record_receipt",
		method: "functionCalling",
		includeRaw: true,
	});

	return async (image, mime, homeCurrency, today) => {
		const messages = [
			{ role: "system", content: SYSTEM },
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `Today is ${today}. Home currency: ${homeCurrency}. Read this receipt.`,
					},
					{
						type: "image_url",
						image_url: {
							url: `data:${mime};base64,${image.toString("base64")}`,
						},
					},
				],
			},
		];
		const out = await hedged(
			(signal) => structured.invoke(messages, { signal }),
			{
				hedgeAfterMs: 5_000,
				deadlineMs: 30_000,
			},
		);
		const { parsed, ...usage } = structuredResult(out, cfg.model);
		return { draft: toDraft(parsed, homeCurrency, today), ...usage };
	};
}
