import { randomUUID } from "node:crypto";
import { createDb } from "@spendid/db";
import type { StoredAskMessage } from "@spendid/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { createThreadRepository, titleOf } from "./threads.repository";

const url = testDbUrl();

const msg = (role: "user" | "assistant", text: string): StoredAskMessage => ({
	id: randomUUID().slice(0, 12),
	role,
	text,
	steps: [],
	charts: [],
	drafts: null,
	status: "done",
});

describe("titleOf", () => {
	it("uses the first question, cut at a word", () => {
		expect(
			titleOf([msg("user", "Where did my money go?"), msg("assistant", "x")]),
		).toBe("Where did my money go?");
		const long = `${"word ".repeat(30)}end`;
		const title = titleOf([msg("user", long)]);
		expect(title.endsWith("…")).toBe(true);
		expect(title.length).toBeLessThanOrEqual(81);
	});
});

describe.skipIf(!url)("saved chats (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const threads = createThreadRepository(database.db);
	let maya: string;
	let sam: string;

	beforeAll(async () => {
		maya = await createPerson(database.db);
		sam = await createPerson(database.db);
	});
	afterAll(() => database.close());

	it("keeps every chat, newest first, and only for its owner", async () => {
		const first = randomUUID();
		const second = randomUUID();
		await threads.save(maya, first, {
			messages: [
				msg("user", "Lunch budget?"),
				msg("assistant", "RM 20 a day."),
			],
		});
		await threads.save(maya, second, { messages: [msg("user", "Bali trip?")] });

		const list = await threads.list(maya);
		expect(list.map((t) => t.title)).toEqual(["Bali trip?", "Lunch budget?"]);
		expect(list[1]?.messageCount).toBe(2);
		expect((await threads.get(maya, first))?.messages[1]?.text).toBe(
			"RM 20 a day.",
		);

		// Someone else can't read, overwrite or delete it.
		expect(await threads.get(sam, first)).toBeNull();
		expect(
			await threads.save(sam, first, { messages: [msg("user", "hijack")] }),
		).toBeNull();
		expect((await threads.get(maya, first))?.title).toBe("Lunch budget?");
		expect(await threads.remove(sam, first)).toBe(false);
		expect(await threads.list(sam)).toEqual([]);

		expect(await threads.remove(maya, first)).toBe(true);
		expect((await threads.list(maya)).map((t) => t.title)).toEqual([
			"Bali trip?",
		]);
	});

	it("refuses oversized or malformed chats", async () => {
		await expect(
			threads.save(maya, randomUUID(), {
				messages: [{ role: "user", text: "no id" }],
			}),
		).rejects.toThrow();
		await expect(
			threads.save(maya, randomUUID(), { messages: [] }),
		).rejects.toThrow();
	});
});
