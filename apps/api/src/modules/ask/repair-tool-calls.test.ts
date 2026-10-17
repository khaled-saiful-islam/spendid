import { AIMessage } from "langchain";
import { describe, expect, it } from "vitest";
import { parseLoosely, repairToolCalls } from "./repair-tool-calls";

describe("repairToolCalls", () => {
	it("turns an almost-JSON tool call into a real one", () => {
		const broken = new AIMessage({
			content: "Let me prepare that.",
			tool_calls: [],
			invalid_tool_calls: [
				{
					name: "propose_goal",
					// What ILMU actually sent: the quotes around two values went missing.
					args: '{"name": "new laptop", "target": 5000, "byYear": 2027, "icon": laptopp"}',
					id: "call-1",
					error: "not valid JSON",
					type: "invalid_tool_call",
				},
			],
		});
		const fixed = repairToolCalls(broken);
		expect(fixed.tool_calls).toEqual([
			expect.objectContaining({
				name: "propose_goal",
				id: "call-1",
				args: expect.objectContaining({
					name: "new laptop",
					target: 5000,
					byYear: 2027,
					icon: "laptop",
				}),
			}),
		]);
		expect(fixed.invalid_tool_calls).toEqual([]);
	});

	it("leaves good messages alone", () => {
		const ok = new AIMessage({ content: "Hi", tool_calls: [] });
		expect(repairToolCalls(ok)).toBe(ok);
	});

	it("undoes the doubled-last-character glitch exactly", () => {
		expect(
			parseLoosely(
				'{"name": "new laptop", "target": 5000, "byDate": 2027-06-300", "icon": laptopp"}',
			),
		).toEqual({
			name: "new laptop",
			target: 5000,
			byDate: "2027-06-30",
			icon: "laptop",
		});
		expect(parseLoosely('{"emoji": 💻💻"}')).toEqual({ emoji: "💻" });
		expect(parseLoosely('{"name": netflixx", "ok": true}')).toEqual({
			name: "netflix",
			ok: true,
		});
		// Numbers and proper strings are untouched.
		expect(parseLoosely('{"amount": 1100, "name": "coffee"}')).toEqual({
			amount: 1100,
			name: "coffee",
		});
	});

	it("parses strict JSON first and rejects non-objects", () => {
		expect(parseLoosely('{"a":1}')).toEqual({ a: 1 });
		expect(parseLoosely("[1,2]")).toBeNull();
	});
});
