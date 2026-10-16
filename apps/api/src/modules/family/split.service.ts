import { randomBytes } from "node:crypto";
import { type Db, receipt, split, user } from "@spendid/db";
import {
	computeSplit,
	FAMILY_EVENT,
	type FamilyEvent,
	formatMinor,
	ReceiptDraftSchema,
	type SplitDto,
	type SplitInput,
	SplitInputSchema,
	SplitPaidSchema,
} from "@spendid/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { badRequest, notFound } from "../../http/app-error";
import type { FamilyRepository } from "./family.repository";
import type { Publish } from "./family.service";

type Row = typeof split.$inferSelect;
type Stored = Pick<SplitInput, "people" | "items" | "adjustMinor">;

export interface ReceiptChoice {
	id: string;
	merchant: string;
	date: string | null;
	currency: string;
	totalMinor: number;
	taxMinor: number | null;
	items: { name: string; totalMinor: number }[];
}

/** Bill splits: who had what, a fair share of tax, and a read-only link to send. */
export function createSplitService(deps: {
	db: Db;
	repo: FamilyRepository;
	publish: Publish;
	appUrl: string;
}) {
	const { db, repo } = deps;

	function dto(row: Row, ownerName: string, owner: boolean): SplitDto {
		const data = row.data as Stored;
		return {
			id: row.id,
			title: row.title,
			currency: row.currency,
			createdAt: row.createdAt.toISOString(),
			ownerName,
			people: data.people,
			items: data.items,
			adjustMinor: data.adjustMinor,
			paid: row.paid as string[],
			result: computeSplit(data),
			url: owner ? `${deps.appUrl}/split/${row.publicToken}` : null,
		};
	}

	async function owned(userId: string, id: string): Promise<Row> {
		const [row] = await db
			.select()
			.from(split)
			.where(and(eq(split.id, id), eq(split.ownerId, userId)))
			.limit(1);
		if (!row) throw notFound("Split");
		return row;
	}

	const nameOf = async (userId: string) =>
		(await repo.contact(userId))?.name ?? "Someone";

	return {
		/** Recent receipts the AI has read, with their lines, to split from. */
		async receiptChoices(userId: string): Promise<ReceiptChoice[]> {
			const rows = await db
				.select({ id: receipt.id, draft: receipt.draft })
				.from(receipt)
				.where(
					and(
						eq(receipt.userId, userId),
						inArray(receipt.status, ["ready", "saved"]),
					),
				)
				.orderBy(desc(receipt.createdAt))
				.limit(12);
			return rows.flatMap((r) => {
				const draft = ReceiptDraftSchema.safeParse(r.draft);
				if (!draft.success || draft.data.items.length === 0) return [];
				return [
					{
						id: r.id,
						merchant: draft.data.merchant,
						date: draft.data.date,
						currency: draft.data.currency,
						totalMinor: draft.data.totalMinor,
						taxMinor: draft.data.taxMinor,
						items: draft.data.items.map((i) => ({
							name: i.name,
							totalMinor: i.totalMinor,
						})),
					},
				];
			});
		},

		async create(userId: string, raw: SplitInput): Promise<SplitDto> {
			const input = SplitInputSchema.parse(raw);
			for (const p of input.people)
				if (
					p.userId &&
					p.userId !== userId &&
					!(await repo.isConnected(userId, p.userId))
				)
					throw badRequest(
						"You can only add people from your circle by account.",
					);
			const data: Stored = {
				people: input.people,
				items: input.items,
				adjustMinor: input.adjustMinor,
			};
			const [row] = await db
				.insert(split)
				.values({
					ownerId: userId,
					title: input.title,
					currency: input.currency,
					data,
					publicToken: randomBytes(18).toString("base64url"),
				})
				.returning();
			if (!row) throw new Error("split insert returned nothing");
			const ownerName = await nameOf(userId);
			const result = computeSplit(data);
			await Promise.all(
				input.people
					.filter((p) => p.userId && p.userId !== userId)
					.map((p) => {
						const share =
							result.shares.find((s) => s.key === p.key)?.totalMinor ?? 0;
						const event: FamilyEvent = {
							type: FAMILY_EVENT,
							what: "pulse",
							message: `${ownerName} split ${input.title} with you: your share is ${formatMinor(share, input.currency)}.`,
						};
						return deps
							.publish(p.userId as string, event)
							.catch(() => undefined);
					}),
			);
			return dto(row, ownerName, true);
		},

		async list(userId: string): Promise<SplitDto[]> {
			const rows = await db
				.select()
				.from(split)
				.where(eq(split.ownerId, userId))
				.orderBy(desc(split.createdAt))
				.limit(20);
			const ownerName = await nameOf(userId);
			return rows.map((r) => dto(r, ownerName, true));
		},

		/** Splits someone in my circle added me to. */
		async withMe(userId: string): Promise<SplitDto[]> {
			const rows = await db
				.select({ split, ownerName: user.name })
				.from(split)
				.innerJoin(user, eq(user.id, split.ownerId))
				.where(
					sql`${split.data}->'people' @> ${JSON.stringify([{ userId }])}::jsonb`,
				)
				.orderBy(desc(split.createdAt))
				.limit(20);
			const visible = [];
			for (const r of rows)
				if (
					r.split.ownerId !== userId &&
					(await repo.isConnected(userId, r.split.ownerId))
				)
					visible.push(dto(r.split, r.ownerName, false));
			return visible;
		},

		async get(userId: string, id: string): Promise<SplitDto> {
			return dto(await owned(userId, id), await nameOf(userId), true);
		},

		async setPaid(userId: string, id: string, raw: unknown): Promise<SplitDto> {
			const { key, paid } = SplitPaidSchema.parse(raw);
			const row = await owned(userId, id);
			if (!(row.data as Stored).people.some((p) => p.key === key))
				throw notFound("Person");
			const current = (row.paid as string[]).filter((k) => k !== key);
			const next = paid ? [...current, key] : current;
			const [updated] = await db
				.update(split)
				.set({ paid: next })
				.where(eq(split.id, id))
				.returning();
			if (!updated) throw notFound("Split");
			return dto(updated, await nameOf(userId), true);
		},

		async remove(userId: string, id: string): Promise<void> {
			const rows = await db
				.delete(split)
				.where(and(eq(split.id, id), eq(split.ownerId, userId)))
				.returning({ id: split.id });
			if (rows.length === 0) throw notFound("Split");
		},

		/** The read-only page behind a split link: names and amounts only. */
		async publicView(token: string): Promise<SplitDto> {
			const [row] = await db
				.select({ split, ownerName: user.name })
				.from(split)
				.innerJoin(user, eq(user.id, split.ownerId))
				.where(eq(split.publicToken, token))
				.limit(1);
			if (!row) throw notFound("Split");
			const view = dto(row.split, row.ownerName, false);
			return {
				...view,
				people: view.people.map((p) => ({ ...p, userId: null })),
			};
		},
	};
}

export type SplitService = ReturnType<typeof createSplitService>;
