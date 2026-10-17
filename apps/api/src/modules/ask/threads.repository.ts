import { askThread, type Db } from "@spendid/db";
import {
	type AskThread,
	AskThreadSaveSchema,
	type AskThreadSummary,
	type StoredAskMessage,
} from "@spendid/shared";
import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";

const LIST_LIMIT = 50;
const TITLE_MAX = 80;

/** The chat's title: its first question, shortened at a word boundary. */
export function titleOf(messages: StoredAskMessage[]): string {
	const first = messages.find((m) => m.role === "user")?.text.trim() ?? "";
	if (first.length <= TITLE_MAX) return first || "New chat";
	const cut = first.slice(0, TITLE_MAX);
	return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : TITLE_MAX)}…`;
}

const PREVIEW_MAX = 140;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const summaryColumns = {
	id: askThread.id,
	title: askThread.title,
	messageCount: askThread.messageCount,
	updatedAt: askThread.updatedAt,
	preview: sql<string>`coalesce(left(${askThread.messages} -> -1 ->> 'text', ${PREVIEW_MAX}), '')`,
	hasChart: sql<boolean>`jsonb_path_exists(${askThread.messages}, '$[*] ? (@.charts.size() > 0)')`,
	madeSomething: sql<boolean>`jsonb_path_exists(${askThread.messages}, '$[*].actions[*] ? (@.status == "done")') or jsonb_path_exists(${askThread.messages}, '$[*] ? (@.drafts.size() == 0)')`,
};

/** The words around the first match, for search results. */
export function snippetAround(text: string, q: string): string {
	const at = text.toLowerCase().indexOf(q.toLowerCase());
	if (at < 0) return text.slice(0, PREVIEW_MAX);
	const start = Math.max(0, at - 50);
	const out = text.slice(start, start + PREVIEW_MAX).trim();
	return `${start > 0 ? "…" : ""}${out}${start + PREVIEW_MAX < text.length ? "…" : ""}`;
}

/** Saved Ask Spendid chats. Every query is scoped to the owner. */
export function createThreadRepository(db: Db) {
	return {
		/** Newest first; with `q`, only chats whose title or words match, previewing the match. */
		async list(userId: string, q?: string): Promise<AskThreadSummary[]> {
			const term = q?.trim().slice(0, 80);
			const where: SQL[] = [eq(askThread.userId, userId)];
			if (term) {
				const like = `%${escapeLike(term)}%`;
				const match = or(
					ilike(askThread.title, like),
					sql`exists (select 1 from jsonb_array_elements(${askThread.messages}) m where m ->> 'text' ilike ${like})`,
				);
				if (match) where.push(match);
			}
			const rows = await db
				.select(
					term
						? { ...summaryColumns, messages: askThread.messages }
						: summaryColumns,
				)
				.from(askThread)
				.where(and(...where))
				.orderBy(desc(askThread.updatedAt))
				.limit(LIST_LIMIT);
			return rows.map((r) => {
				const { messages, ...rest } = r as typeof r & {
					messages?: StoredAskMessage[];
				};
				const hit = term
					? messages?.find((m) =>
							m.text.toLowerCase().includes(term.toLowerCase()),
						)
					: undefined;
				return {
					...rest,
					preview: hit ? snippetAround(hit.text, term ?? "") : rest.preview,
					updatedAt: rest.updatedAt.toISOString(),
				};
			});
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
