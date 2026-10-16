import { ChatOpenAI } from "@langchain/openai";
import { type ReceiptDraft, SYSTEM_CATEGORIES, splitQuantity, toMinor } from "@spendid/shared";
import { z } from "zod";
import { hedged } from "./hedge";

const SLUGS = SYSTEM_CATEGORIES.map((c) => c.slug) as [string, ...string[]];
const KNOWN = new Set(Intl.supportedValuesOf("currency"));

const ReadSchema = z.object({
	merchant: z.string().describe("Shop name as printed"),
	date: z.string().nullable().describe("Purchase date YYYY-MM-DD, null if not visible"),
	currency: z.string().nullable().describe("ISO code, e.g. RM = MYR; null if unclear"),
	total: z.number().min(0).describe("Final amount paid, after tax and discounts"),
	tax: z.number().min(0).nullable(),
	category: z.enum(SLUGS).describe("Best single category for the whole receipt"),
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
- merchant: the shop name. date: purchase date as YYYY-MM-DD, or null.
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

export type ReceiptReader = (image: Buffer, mime: string, homeCurrency: string) => Promise<ReceiptReading>;

/** "XIAOMI POWER BANK 20K" → "Xiaomi Power Bank 20K": words with digits (sizes, models) keep their case. */
const titleCase = (s: string) =>
	s
		.trim()
		.split(/\s+/)
		.map((w) => (/\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
		.join(" ");

/** Raw model output (major units) → a draft in minor units. */
export function toDraft(read: z.infer<typeof ReadSchema>, homeCurrency: string): ReceiptDraft {
	const upper = read.currency?.toUpperCase();
	const currency = upper && KNOWN.has(upper) ? upper : homeCurrency;
	const date = read.date && /^\d{4}-\d{2}-\d{2}$/.test(read.date) ? read.date : null;
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
			const quantity = split.quantity > 1 ? split.quantity : item.quantity && item.quantity > 0 ? item.quantity : 1;
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

export function createReceiptReader(cfg: { baseUrl: string; apiKey: string; model: string }): ReceiptReader {
	const llm = new ChatOpenAI({
		model: cfg.model,
		apiKey: cfg.apiKey,
		temperature: 0,
		maxRetries: 0,
		configuration: { baseURL: cfg.baseUrl },
	});
	const structured = llm.withStructuredOutput(ReadSchema, { name: "record_receipt", method: "functionCalling", includeRaw: true });

	return async (image, mime, homeCurrency) => {
		const messages = [
			{ role: "system", content: SYSTEM },
			{
				role: "user",
				content: [
					{ type: "text", text: `Home currency: ${homeCurrency}. Read this receipt.` },
					{ type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}` } },
				],
			},
		];
		const { raw, parsed } = await hedged((signal) => structured.invoke(messages, { signal }), {
			hedgeAfterMs: 5_000,
			deadlineMs: 30_000,
		});
		const usage = (raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
		return {
			draft: toDraft(parsed, homeCurrency),
			inputTokens: usage?.input_tokens ?? 0,
			outputTokens: usage?.output_tokens ?? 0,
			model: cfg.model,
		};
	};
}
