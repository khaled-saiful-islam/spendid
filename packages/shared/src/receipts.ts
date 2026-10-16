import { z } from "zod";

export const RECEIPT_STATUSES = [
	"reading",
	"ready",
	"failed",
	"saved",
] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const ReceiptItemSchema = z.object({
	name: z.string().trim().min(1).max(120),
	quantity: z.number().positive().max(10_000),
	unitPriceMinor: z.number().int().min(0),
	totalMinor: z.number().int().min(0),
	/** Months of warranty printed on the receipt (or typical for the item), else null. */
	warrantyMonths: z.number().int().min(1).max(120).nullable(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

/** What the AI read from a receipt photo, in minor units — a draft for the person to check. */
export const ReceiptDraftSchema = z.object({
	merchant: z.string(),
	date: z.iso.date().nullable(),
	currency: z.string().length(3),
	totalMinor: z.number().int().min(0),
	taxMinor: z.number().int().min(0).nullable(),
	categorySlug: z.string(),
	items: z.array(ReceiptItemSchema).max(200),
});
export type ReceiptDraft = z.infer<typeof ReceiptDraftSchema>;

/** Price memory for one item: what the same thing cost last time. */
export const PriceMemorySchema = z.object({
	itemName: z.string(),
	previousUnitMinor: z.number(),
	previousAt: z.string(),
	changePct: z.number(),
});
export type PriceMemory = z.infer<typeof PriceMemorySchema>;

export const ReceiptSchema = z.object({
	id: z.uuid(),
	status: z.enum(RECEIPT_STATUSES),
	createdAt: z.string(),
	error: z.string().nullable(),
	draft: ReceiptDraftSchema.nullable(),
	priceMemory: z.array(PriceMemorySchema),
	transactionId: z.uuid().nullable(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const ReceiptSaveSchema = z.object({
	merchant: z.string().trim().min(1, "Add the shop name").max(80),
	categoryId: z.uuid("Pick a category"),
	currency: z.string().length(3),
	totalMinor: z.number().int().positive("The total must be above zero"),
	occurredAt: z.iso.datetime({ offset: true }),
	items: z.array(ReceiptItemSchema.omit({ warrantyMonths: true })).max(200),
	warranties: z
		.array(
			z.object({
				itemName: z.string().min(1).max(120),
				months: z.number().int().min(1).max(120),
			}),
		)
		.max(50),
});
export type ReceiptSave = z.infer<typeof ReceiptSaveSchema>;

/** Live update pushed to the person's open apps. */
export const ReceiptEventSchema = z.object({
	type: z.literal("receipt"),
	id: z.uuid(),
	status: z.enum(RECEIPT_STATUSES),
});
export type ReceiptEvent = z.infer<typeof ReceiptEventSchema>;

/**
 * Stable key for "the same product" across receipts: lower-case, punctuation gone,
 * words sorted ("MILK FRESH 1L" = "Fresh Milk 1L"). Pack sizes stay, so 1L ≠ 2L.
 */
export function itemKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.split(" ")
		.filter(Boolean)
		.sort()
		.join(" ");
}

/** "MILK 1L x2" → { name: "MILK 1L", quantity: 2 }; also "2 x Teh". */
export function splitQuantity(raw: string): { name: string; quantity: number } {
	const trailing = raw.match(/^(.*?)\s*[x×*]\s*(\d{1,4})$/i);
	if (trailing?.[1])
		return { name: trailing[1].trim(), quantity: Number(trailing[2]) };
	const leading = raw.match(/^(\d{1,4})\s*[x×*]\s+(.+)$/i);
	if (leading?.[2])
		return { name: leading[2].trim(), quantity: Number(leading[1]) };
	return { name: raw.trim(), quantity: 1 };
}

/** Whole-percent change from the previous unit price, or null when there's nothing to compare. */
export function priceChange(
	previousUnitMinor: number,
	currentUnitMinor: number,
): number | null {
	if (previousUnitMinor <= 0) return null;
	return Math.round(
		((currentUnitMinor - previousUnitMinor) / previousUnitMinor) * 100,
	);
}
