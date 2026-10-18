import { describe, expect, it } from "vitest";
import { keyToBytes } from "./push";

describe("keyToBytes", () => {
	it("turns a base64url key into raw bytes, padding as needed", () => {
		expect(Array.from(keyToBytes("AQID"))).toEqual([1, 2, 3]);
		expect(Array.from(keyToBytes("_-8"))).toEqual([255, 239]);
	});
});
