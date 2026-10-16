import { z } from "zod";

const key = z.string().min(1).max(40);

export const SplitPersonSchema = z.object({
	key,
	name: z.string().trim().min(1, "Add a name").max(40),
	/** Set when the person is in the owner's family circle. */
	userId: z.string().max(64).nullable(),
});
export type SplitPerson = z.infer<typeof SplitPersonSchema>;

export const SplitItemSchema = z.object({
	key,
	name: z.string().trim().min(1).max(120),
	amountMinor: z.number().int().min(0).max(100_000_000),
	/** Who had it. Shared items split evenly between them. */
	people: z.array(key).max(30),
});
export type SplitItem = z.infer<typeof SplitItemSchema>;

export const SplitInputSchema = z
	.object({
		title: z.string().trim().min(1, "Name this bill").max(80),
		currency: z.string().length(3),
		people: z
			.array(SplitPersonSchema)
			.min(2, "Add at least two people")
			.max(30),
		items: z.array(SplitItemSchema).min(1, "Add at least one item").max(200),
		/** Tax, service charge or tip (positive) or a discount (negative), shared in proportion. */
		adjustMinor: z.number().int().min(-100_000_000).max(100_000_000),
		receiptId: z.uuid().nullable().optional(),
	})
	.superRefine((s, ctx) => {
		const keys = new Set(s.people.map((p) => p.key));
		if (keys.size !== s.people.length)
			ctx.addIssue({
				code: "custom",
				message: "Each person needs a different name",
				path: ["people"],
			});
		s.items.forEach((item, i) => {
			if (item.people.length === 0)
				ctx.addIssue({
					code: "custom",
					message: `Give "${item.name}" to someone`,
					path: ["items", i],
				});
			if (item.people.some((p) => !keys.has(p)))
				ctx.addIssue({
					code: "custom",
					message: "Unknown person on an item",
					path: ["items", i],
				});
		});
	});
export type SplitInput = z.infer<typeof SplitInputSchema>;

export interface SplitShare {
	key: string;
	name: string;
	itemsMinor: number;
	adjustMinor: number;
	totalMinor: number;
}

export interface SplitResult {
	shares: SplitShare[];
	/** Items nobody has yet. */
	unassignedMinor: number;
	totalMinor: number;
}

/**
 * Splits `total` into whole minor units by `weights`, so the parts always add up exactly.
 * Leftover units go to the largest fractional parts (ties: earlier first).
 */
export function allocate(total: number, weights: number[]): number[] {
	const sum = weights.reduce((a, w) => a + w, 0);
	if (weights.length === 0) return [];
	if (sum === 0)
		return allocate(
			total,
			weights.map(() => 1),
		);
	const sign = total < 0 ? -1 : 1;
	const abs = Math.abs(total);
	const exact = weights.map((w) => (abs * w) / sum);
	const floors = exact.map(Math.floor);
	let left = abs - floors.reduce((a, f) => a + f, 0);
	const order = exact
		.map((e, i) => ({ i, frac: e - Math.floor(e) }))
		.sort((a, b) => b.frac - a.frac || a.i - b.i);
	const result = [...floors];
	for (const { i } of order) {
		if (left === 0) break;
		result[i] = (result[i] ?? 0) + 1;
		left -= 1;
	}
	return result.map((r) => r * sign);
}

/** Who owes what. Works on drafts too: items without people count as unassigned. */
export function computeSplit(
	input: Pick<SplitInput, "people" | "items" | "adjustMinor">,
): SplitResult {
	const itemsBy = new Map(input.people.map((p) => [p.key, 0]));
	let unassignedMinor = 0;
	for (const item of input.items) {
		const owners = item.people.filter((k) => itemsBy.has(k));
		if (owners.length === 0) {
			unassignedMinor += item.amountMinor;
			continue;
		}
		allocate(
			item.amountMinor,
			owners.map(() => 1),
		).forEach((part, i) => {
			const k = owners[i] as string;
			itemsBy.set(k, (itemsBy.get(k) ?? 0) + part);
		});
	}
	const subtotals = input.people.map((p) => itemsBy.get(p.key) ?? 0);
	const adjusts = allocate(input.adjustMinor, subtotals);
	const shares = input.people.map((p, i) => {
		const itemsMinor = subtotals[i] ?? 0;
		const adjustMinor = subtotals.some((s) => s > 0) ? (adjusts[i] ?? 0) : 0;
		return {
			key: p.key,
			name: p.name,
			itemsMinor,
			adjustMinor,
			totalMinor: itemsMinor + adjustMinor,
		};
	});
	const totalMinor =
		input.items.reduce((a, it) => a + it.amountMinor, 0) + input.adjustMinor;
	return { shares, unassignedMinor, totalMinor };
}

export interface SplitDto {
	id: string;
	title: string;
	currency: string;
	createdAt: string;
	ownerName: string;
	people: SplitPerson[];
	items: SplitItem[];
	adjustMinor: number;
	paid: string[];
	result: SplitResult;
	/** Only for the owner. */
	url: string | null;
}

export const SplitPaidSchema = z.object({ key, paid: z.boolean() });
