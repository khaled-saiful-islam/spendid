import { tool } from "langchain";
import { z } from "zod";

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

function tokenize(expression: string): Token[] {
	const text = expression.trim();
	if (!text) throw new Error("The expression is empty.");
	if (!/^[\d.,+\-*/()\s]+$/.test(text))
		throw new Error(
			"Use only numbers, + - * / and brackets (for a percentage, divide by the total and × 100).",
		);
	const tokens: Token[] = [];
	const pattern = /\s*(\d[\d,]*(?:\.\d+)?|\.\d+|[+\-*/()])/y;
	let at = 0;
	while (at < text.length) {
		pattern.lastIndex = at;
		const match = pattern.exec(text);
		if (!match?.[1]) {
			if (/^\s*$/.test(text.slice(at))) break;
			throw new Error("Use only numbers, + - * / and brackets.");
		}
		const piece = match[1];
		tokens.push(
			/^[\d.]/.test(piece)
				? { kind: "num", value: Number(piece.replace(/,/g, "")) }
				: { kind: "op", value: piece },
		);
		at = pattern.lastIndex;
	}
	return tokens;
}

/** Recursive descent: sums of products of (signed) numbers and brackets. */
function parse(tokens: Token[]): number {
	let i = 0;
	const peek = () => tokens[i];

	function primary(): number {
		const t = tokens[i++];
		if (!t) throw new Error("The expression isn't complete.");
		if (t.kind === "num") {
			if (!Number.isFinite(t.value)) throw new Error("A number is malformed.");
			return t.value;
		}
		if (t.value === "-") return -primary();
		if (t.value === "+") return primary();
		if (t.value === "(") {
			const v = sum();
			const close = tokens[i++];
			if (close?.value !== ")") throw new Error("A bracket isn't closed.");
			return v;
		}
		throw new Error("The expression isn't complete.");
	}

	function product(): number {
		let v = primary();
		for (let t = peek(); t?.value === "*" || t?.value === "/"; t = peek()) {
			i++;
			const right = primary();
			if (t.value === "/" && right === 0)
				throw new Error("Can't divide by zero.");
			v = t.value === "*" ? v * right : v / right;
		}
		return v;
	}

	function sum(): number {
		let v = product();
		for (let t = peek(); t?.value === "+" || t?.value === "-"; t = peek()) {
			i++;
			const right = product();
			v = t.value === "+" ? v + right : v - right;
		}
		return v;
	}

	const value = sum();
	if (i < tokens.length) {
		const extra = tokens[i];
		throw new Error(
			extra?.value === ")"
				? "A bracket is closed that was never opened."
				: "The expression isn't complete.",
		);
	}
	return value;
}

/** Half away from zero, to 2 decimals, without float noise (1.005 → 1.01). */
function round2(x: number): number {
	const clean = Number(x.toPrecision(12));
	if (Math.abs(clean) < 0.000_001) return 0;
	const rounded = Number(`${Math.round(Number(`${Math.abs(clean)}e2`))}e-2`);
	return Math.sign(clean) * rounded;
}

/** Exact arithmetic for money answers: + - * / and brackets, rounded to 2 decimals. */
export function evaluate(expression: string): number {
	return round2(parse(tokenize(expression)));
}

/** The model never adds up in its head: sums, differences, averages and percentages go here. */
export const calculateTool = () =>
	tool(
		async ({ expression }) => {
			try {
				return JSON.stringify({ expression, result: evaluate(expression) });
			} catch (error) {
				return JSON.stringify({
					expression,
					error:
						error instanceof Error ? error.message : "Can't work that out.",
				});
			}
		},
		{
			name: "calculate",
			description:
				"Exact arithmetic. Use it for EVERY sum, difference, average, share or percentage you say; never work numbers out yourself. Numbers, + - * / and brackets only, e.g. '(156.80 / 1757.40) * 100'. Result is rounded to 2 decimals.",
			schema: z.object({ expression: z.string().max(300) }),
		},
	);
