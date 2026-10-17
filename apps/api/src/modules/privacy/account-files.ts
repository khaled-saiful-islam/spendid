import { type Db, dataExport, receipt } from "@spendid/db";
import type { ErrorLog, FileStore } from "@spendid/server";
import { eq } from "drizzle-orm";

/**
 * Receipt photos and export archives live on disk, outside the database cascade.
 * Better Auth deletes every account through one function (self-delete and admin remove
 * alike), so its user-delete hooks call these: note the files before, remove them after.
 */
export function createAccountFiles(deps: {
	db: Db;
	store: FileStore;
	logError: ErrorLog;
}) {
	const { db, store } = deps;
	const pending = new Map<string, string[]>();

	async function keysOf(userId: string): Promise<string[]> {
		const photos = await db
			.select({ key: receipt.fileKey })
			.from(receipt)
			.where(eq(receipt.userId, userId));
		const archives = await db
			.select({ key: dataExport.fileKey })
			.from(dataExport)
			.where(eq(dataExport.userId, userId));
		return [...photos, ...archives]
			.map((r) => r.key)
			.filter((k): k is string => Boolean(k));
	}

	return {
		/** Before the account row is deleted (its receipt rows go with it). */
		collect: async (userId: string): Promise<void> => {
			pending.set(userId, await keysOf(userId));
		},
		/** After the account is gone. */
		remove: async (userId: string): Promise<void> => {
			const keys = pending.get(userId) ?? [];
			pending.delete(userId);
			const results = await Promise.allSettled(
				keys.map((k) => store.remove(k)),
			);
			const failed = results.filter((r) => r.status === "rejected");
			if (failed.length > 0)
				deps.logError(
					`account delete: ${failed.length} of ${keys.length} files could not be removed`,
					failed[0]?.status === "rejected" ? failed[0].reason : null,
				);
		},
	};
}

export type AccountFiles = ReturnType<typeof createAccountFiles>;
