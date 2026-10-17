import { createDb } from "@spendid/db";
import type { AiGuard, ExpenseExtractor, Transcriber } from "@spendid/server";
import type { FastifyBaseLogger } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import { seedCategories } from "../../scripts/categories";
import { createCategoryRepository } from "../money/categories.repository";
import { createVoiceService } from "./voice.service";

const url = testDbUrl();
const log = { info: () => {}, warn: () => {} } as unknown as FastifyBaseLogger;
const guard = {
	assertAllowed: async () => {},
	record: async () => {},
} as unknown as AiGuard;

describe.skipIf(!url)("voice notes (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	let maya: string;
	beforeAll(async () => {
		await seedCategories(db);
		maya = await createPerson(db);
	});
	afterAll(() => database.close());

	const serviceHearing = (text: string, extract: ExpenseExtractor) =>
		createVoiceService({
			db,
			guard,
			categories: createCategoryRepository(db),
			transcriber: {
				transcribe: async () => ({ text, seconds: 2 }),
			} as unknown as Transcriber,
			extract,
			asrModel: "test",
		});

	it("doesn't ask the AI about a phrase with no amount (a greeting, small talk)", async () => {
		const extract = vi.fn<ExpenseExtractor>();
		const result = await serviceHearing("Hi.", extract).read(
			maya,
			Buffer.from("x"),
			"audio/wav",
			log,
		);
		expect(result.drafts).toEqual([]);
		expect(extract).not.toHaveBeenCalled();
	});

	it("keeps only the shop when the AI is unavailable and the fallback reads it", async () => {
		const extract = vi.fn<ExpenseExtractor>(async () => {
			throw new Error("ILMU timed out");
		});
		const result = await serviceHearing(
			"Hi, yesterday I spent 20 RM in grab.",
			extract,
		).read(maya, Buffer.from("x"), "audio/wav", log);
		expect(result.readBy).toBe("quick");
		expect(
			result.drafts.map((d) => [d.merchant, d.amountMinor, d.daysAgo]),
		).toEqual([["Grab", 2000, 1]]);
	});
});
