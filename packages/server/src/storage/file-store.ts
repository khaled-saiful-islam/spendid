import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FileStore {
	/** Encrypts and stores bytes for an owner; returns the key to fetch them later. */
	put(ownerId: string, bytes: Buffer): Promise<string>;
	get(fileKey: string): Promise<Buffer>;
	remove(fileKey: string): Promise<void>;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}\.bin$/;

/**
 * Receipt photos at rest: AES-256-GCM, one random IV per file, layout = IV | tag | ciphertext.
 * Swappable for S3 later behind the same interface.
 */
export function createFileStore(opts: { root: string; keyBase64: string }): FileStore {
	const key = Buffer.from(opts.keyBase64, "base64");
	if (key.length !== 32) throw new Error("RECEIPT_ENCRYPTION_KEY must be 32 bytes (base64)");

	const pathOf = (fileKey: string) => {
		if (!KEY_PATTERN.test(fileKey)) throw new Error("invalid file key");
		return join(opts.root, fileKey);
	};

	return {
		async put(ownerId, bytes) {
			const owner = ownerId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
			const fileKey = `${owner}/${randomUUID()}.bin`;
			const iv = randomBytes(IV_BYTES);
			const cipher = createCipheriv("aes-256-gcm", key, iv);
			const sealed = Buffer.concat([cipher.update(bytes), cipher.final()]);
			await mkdir(join(opts.root, owner), { recursive: true });
			await writeFile(pathOf(fileKey), Buffer.concat([iv, cipher.getAuthTag(), sealed]), { mode: 0o600 });
			return fileKey;
		},

		async get(fileKey) {
			const raw = await readFile(pathOf(fileKey));
			const iv = raw.subarray(0, IV_BYTES);
			const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
			const decipher = createDecipheriv("aes-256-gcm", key, iv);
			decipher.setAuthTag(tag);
			return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
		},

		async remove(fileKey) {
			await rm(pathOf(fileKey), { force: true });
		},
	};
}
