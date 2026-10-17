import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFileStore, type FileStore } from "./file-store";

describe("encrypted file store", () => {
	let root: string;
	let store: FileStore;
	const key = randomBytes(32).toString("base64");

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "spendid-store-"));
		store = createFileStore({ root, keyBase64: key });
	});
	afterAll(() => rm(root, { recursive: true, force: true }));

	it("round-trips bytes and never writes them in the clear", async () => {
		const secret = Buffer.from("JAYA GROCER total RM 130.70");
		const fileKey = await store.put("user_1", secret);
		expect(await store.get(fileKey)).toEqual(secret);
		const onDisk = await readFile(join(root, fileKey));
		expect(onDisk.includes(secret)).toBe(false);
	});

	it("refuses a file that was tampered with", async () => {
		const fileKey = await store.put("user_1", Buffer.from("receipt"));
		const path = join(root, fileKey);
		const bytes = await readFile(path);
		bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 0xff;
		await writeFile(path, bytes);
		await expect(store.get(fileKey)).rejects.toThrow();
	});

	it("rejects keys that try to leave the folder", async () => {
		await expect(store.get("../../etc/passwd")).rejects.toThrow(
			/invalid file key/,
		);
	});

	it("needs a 32-byte key", () => {
		expect(() => createFileStore({ root, keyBase64: "c2hvcnQ=" })).toThrow(
			/32 bytes/,
		);
	});
});
