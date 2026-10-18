import { createDb, pushSubscription } from "@spendid/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createPerson, testDbUrl } from "../../test/db";
import { createPush, type PushSender } from "./push";

const url = testDbUrl();

describe.skipIf(!url)("push notifications (real database)", () => {
	const database = createDb(url ?? "postgres://unused", 2);
	const db = database.db;
	const sent: { endpoint: string; payload: string }[] = [];
	let gone = new Set<string>();
	const sender: PushSender = async (sub, payload) => {
		if (gone.has(sub.endpoint)) {
			const err = new Error("Gone") as Error & { statusCode: number };
			err.statusCode = 410;
			throw err;
		}
		sent.push({ endpoint: sub.endpoint, payload });
	};
	const push = createPush({
		db,
		publicKey: "BPublicKeyForTests",
		privateKey: "private",
		subject: "mailto:test@spendid.test",
		sender,
	});
	const device = (n: number) => ({
		endpoint: `https://push.example.test/device-${n}-${Date.now()}`,
		keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
	});

	afterAll(async () => {
		await database.close();
	});

	it("sends to each of a person's devices, and forgets devices the browser dropped", async () => {
		const maya = await createPerson(db);
		const phone = device(1);
		const laptop = device(2);
		await push.subscribe(maya, phone, "Android Chrome");
		await push.subscribe(maya, laptop, "Mac Chrome");
		await push.subscribe(maya, phone, "Android Chrome");

		const delivered = await push.deliver(maya, {
			title: "Netflix is due tomorrow",
			body: "RM 54.90 on Sun 19 Oct.",
			path: "/app/subscriptions",
		});
		expect(delivered).toBe(2);
		expect(JSON.parse(sent.at(-1)?.payload ?? "{}")).toMatchObject({
			title: "Netflix is due tomorrow",
			url: "/app/subscriptions",
		});

		gone = new Set([laptop.endpoint]);
		expect(
			await push.deliver(maya, { title: "t", body: "b", path: null }),
		).toBe(1);
		const left = await db
			.select({ endpoint: pushSubscription.endpoint })
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, maya));
		expect(left.map((d) => d.endpoint)).toEqual([phone.endpoint]);
	});

	it("moves a device to whoever signs in on it, and only its owner can turn it off", async () => {
		const ana = await createPerson(db);
		const ben = await createPerson(db);
		const shared = device(3);
		await push.subscribe(ana, shared, null);
		await push.subscribe(ben, shared, null);
		expect(await push.deliver(ana, { title: "t", body: "b", path: null })).toBe(
			0,
		);
		await push.unsubscribe(ana, shared.endpoint);
		expect(await push.deliver(ben, { title: "t", body: "b", path: null })).toBe(
			1,
		);
		await push.unsubscribe(ben, shared.endpoint);
		expect(await push.deliver(ben, { title: "t", body: "b", path: null })).toBe(
			0,
		);
	});
});
