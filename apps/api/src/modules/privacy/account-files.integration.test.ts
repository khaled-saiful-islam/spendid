import { createDb, dataExport, receipt, user } from "@spendid/db";
import type { FileStore } from "@spendid/server";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { createAuth } from "../../auth/auth";
import { loadEnv } from "../../config/env";
import { createAccountFiles } from "./account-files";

const url = testDbUrl();
const redisUrl = process.env.REDIS_URL;

function memoryStore() {
	const files = new Map<string, Buffer>();
	const store = {
		put: async (userId: string, bytes: Buffer) => {
			const key = `${userId}/${files.size}`;
			files.set(key, bytes);
			return key;
		},
		get: async (key: string) => files.get(key) ?? Buffer.alloc(0),
		remove: async (key: string) => {
			files.delete(key);
		},
	} as unknown as FileStore;
	return { store, files };
}

describe.skipIf(!url || !redisUrl)(
	"deleting an account removes its files (real database)",
	() => {
		const database = createDb(url ?? "postgres://unused", 2);
		const db = database.db;
		const redis = new Redis(redisUrl ?? "redis://unused");
		afterAll(async () => {
			await redis.quit();
			await database.close();
		});

		async function personWithFiles(store: FileStore) {
			const id = await createPerson(db);
			const photo = await store.put(id, Buffer.from("photo"));
			const archive = await store.put(id, Buffer.from("zip"));
			await db
				.insert(receipt)
				.values({ userId: id, fileKey: photo, mime: "image/jpeg", bytes: 5 });
			await db.insert(dataExport).values({
				userId: id,
				status: "ready",
				fileKey: archive,
				expiresAt: new Date(Date.now() + 3_600_000),
			});
			return id;
		}

		it("removes receipt photos and export archives whichever way the account is deleted", async () => {
			const { store, files } = memoryStore();
			const accountFiles = createAccountFiles({ db, store, logError: vi.fn() });
			const auth = createAuth({
				env: loadEnv({
					DATABASE_URL: url ?? "",
					REDIS_URL: redisUrl ?? "",
					BETTER_AUTH_SECRET: "x".repeat(40),
				}),
				db,
				redis,
				sendEmail: async () => {},
				events: {
					userDeleting: accountFiles.collect,
					userDeleted: accountFiles.remove,
				},
			});
			const maya = await personWithFiles(store);
			const sam = await personWithFiles(store);
			expect(files.size).toBe(4);

			// The path both self-delete and the admin's "remove" go through.
			await (await auth.$context).internalAdapter.deleteUser(maya);

			expect(await db.select().from(user).where(eq(user.id, maya))).toEqual([]);
			await vi.waitFor(() => expect(files.size).toBe(2));
			expect([...files.keys()].every((k) => k.startsWith(sam))).toBe(true);
		});
	},
);
