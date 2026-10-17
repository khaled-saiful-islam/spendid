import { askThread, type Db } from "@spendid/db";
import {
	type AskThread,
	AskThreadSaveSchema,
	type AskThreadSummary,
	type StoredAskMessage,
} from "@spendid/shared";
import { and, desc, eq } from "drizzle-orm";

const LIST_LIMIT = 50;
const TITLE_MAX = 80;

/** The chat's title: its first question, shortened at a word boundary. */
export function titleOf(messages: StoredAskMessage[]): string {
	const first = messages.find((m) => m.role === "user")?.text.trim() ?? "";
	if (first.length <= TITLE_MAX) return first || "New chat";
	const cut = first.slice(0, TITLE_MAX);
	return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : TITLE_MAX)}…`;
}

const summaryColumns = {
	id: askThread.id,
	title: askThread.title,
	messageCount: askThread.messageCount,
	updatedAt: askThread.updatedAt,
};

/** Saved Ask Spendid chats. Every query is scoped to the owner. */
export function createThreadRepository(db: Db) {
	return {
		async list(userId: string): Promise<AskThreadSummary[]> {
			const rows = await db
				.select(summaryColumns)
				.from(askThread)
				.where(eq(askThread.userId, userId))
				.orderBy(desc(askThread.updatedAt))
				.limit(LIST_LIMIT);
			return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
		},

		async get(userId: string, id: string): Promise<AskThread | null> {
			const [row] = await db
				.select({ ...summaryColumns, messages: askThread.messages })
				.from(askThread)
				.where(and(eq(askThread.userId, userId), eq(askThread.id, id)))
				.limit(1);
			if (!row) return null;
			return {
				...row,
				messages: row.messages as StoredAskMessage[],
				updatedAt: row.updatedAt.toISOString(),
			};
		},

		/** Creates or replaces a chat. Someone else's id is never overwritten. */
		async save(
			userId: string,
			id: string,
			raw: unknown,
		): Promise<AskThreadSummary | null> {
			const { messages } = AskThreadSaveSchema.parse(raw);
			const values = {
				title: titleOf(messages),
				messages,
				messageCount: messages.length,
				updatedAt: new Date(),
			};
			const [row] = await db
				.insert(askThread)
				.values({ id, userId, ...values })
				.onConflictDoUpdate({
					target: askThread.id,
					set: values,
					setWhere: eq(askThread.userId, userId),
				})
				.returning(summaryColumns);
			return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
		},

		async remove(userId: string, id: string): Promise<boolean> {
			const gone = await db
				.delete(askThread)
				.where(and(eq(askThread.userId, userId), eq(askThread.id, id)))
				.returning({ id: askThread.id });
			return gone.length > 0;
		},
	};
}

export type ThreadRepository = ReturnType<typeof createThreadRepository>;
