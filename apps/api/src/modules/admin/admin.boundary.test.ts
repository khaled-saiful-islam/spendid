import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Tables that hold people's money, chats or family links. The admin module must never import them. */
const MONEY_TABLES = [
	"transaction",
	"transactionItem",
	"receipt",
	"budget",
	"goal",
	"warranty",
	"category",
	"connection",
	"shareGrant",
	"familyInvite",
	"goalMember",
	"goalDeposit",
	"reaction",
	"split",
	"wish",
	"checkIn",
	"askThread",
	"subscription",
	"dataExport",
];
const dir = __dirname;

describe("admin boundary", () => {
	it("no admin file imports a money table or money module", () => {
		for (const file of readdirSync(dir).filter(
			(f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
		)) {
			const source = readFileSync(join(dir, file), "utf8");
			for (const m of source.matchAll(
				/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@spendid\/db"/g,
			)) {
				const names = (m[1] ?? "")
					.split(",")
					.map((n) => n.trim().replace(/^type\s+/, ""));
				for (const table of MONEY_TABLES)
					expect(names, `${file} imports ${table}`).not.toContain(table);
			}
			expect(source, `${file} reaches into money modules`).not.toMatch(
				/from\s*"\.\.\/(money|receipts|ask|capture|family)\//,
			);
		}
	});
});
