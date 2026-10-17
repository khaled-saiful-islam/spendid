import { createDb, dataExport } from "@spendid/db";
import type { FileStore } from "@spendid/server";
import { afterAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../../test/db";
import type { Auth } from "../../auth/auth";
import type { Notifier } from "../../notify/notifier";
import { createPrivacyService } from "./privacy.service";

const url = testDbUrl();

describe.skipIf(!url)("data export (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const privacy = createPrivacyService({
		db,
		store: { remove: async () => {} } as unknown as FileStore,
		auth: {} as Auth,
		notifier: {} as Notifier,
		sendEmail: async () => {},
		publish: async () => 0,
		appUrl: "http://localhost",
	});
	afterAll(() => database.close());

	it("shows an export cut short by a restart as failed, so it can be asked for again", async () => {
		const maya = await createPerson(db);
		await db.insert(dataExport).values({
			userId: maya,
			status: "building",
			createdAt: new Date(Date.now() - 60 * 60_000),
			expiresAt: new Date(Date.now() + 23 * 60 * 60_000),
		});
		expect((await privacy.latestExport(maya))?.status).toBe("failed");
	});

	it("leaves an export that is still being built alone", async () => {
		const sam = await createPerson(db);
		await db.insert(dataExport).values({
			userId: sam,
			status: "building",
			expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
		});
		expect((await privacy.latestExport(sam))?.status).toBe("building");
	});
});
