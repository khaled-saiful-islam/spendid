import { ChatOpenAI } from "@langchain/openai";
import { SYSTEM_CATEGORIES } from "@spendid/shared";
import { z } from "zod";
import { hedged } from "./hedge";

const SLUGS = SYSTEM_CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export const SpokenExpenseSchema = z.object({
	amount: z.number().positive().describe("The full amount of this purchase"),
	currency: z
		.string()
		.length(3)
		.nullable()
		.describe("ISO code if said, else null for home currency"),
	description: z
		.string()
		.describe("Short name of what was bought, e.g. 'Grab ride', 'Coffee'"),
	category: z.enum(SLUGS),
	splitWith: z
		.string()
		.nullable()
		.describe("Name of the person the bill was split with, else null"),
	yourShare: z
		.number()
		.nullable()
		.describe("What the speaker paid when the bill was split, else null"),
	daysAgo: z.number().int().min(0).max(7).describe("0 today, 1 yesterday"),
});

const ExtractionSchema = z.object({
	expenses: z.array(SpokenExpenseSchema).max(10),
});
export type SpokenExpense = z.infer<typeof SpokenExpenseSchema>;

const SYSTEM = `You turn what a person said into expenses for a spending app.
Rules:
- The text is a speech transcript with little punctuation. Split it into separate purchases; each has its own amount.
- An amount belongs to the item named right before or right after it. "Grab 15" is a Grab ride costing 15.
- Grab, Uber, Gojek, taxi, LRT, petrol = transport. Coffee, lunch, dinner, kopi, teh = food.
- Currency: use one only if said ("ringgit" = MYR, "dollars" = USD unless context says otherwise), else null.
- Split bills: amount is the whole bill, yourShare is what the speaker paid, splitWith is the other person.
- "yesterday" / "semalam" means daysAgo 1. Otherwise 0.
- Never invent amounts. Skip anything without an amount. The person may mix English and Malay.
Example: "teh tarik 3 and nasi lemak 8 50" -> Teh tarik 3 (food), Nasi lemak 8.50 (food).`;

export interface ExtractionResult {
	expenses: SpokenExpense[];
	inputTokens: number;
	outputTokens: number;
	model: string;
}

export type ExpenseExtractor = (
	transcript: string,
	homeCurrency: string,
	/** What the person said earlier in the same note: context only (dates, who), not items. */
	earlier?: string,
) => Promise<ExtractionResult>;

/** One structured call (no agent loop): transcript in, typed expenses out. */
export function createExpenseExtractor(cfg: {
	baseUrl: string;
	apiKey: string;
	model: string;
}): ExpenseExtractor {
	const llm = new ChatOpenAI({
		model: cfg.model,
		apiKey: cfg.apiKey,
		temperature: 0,
		// Retries are handled by `hedged` below, which also caps the total wait.
		maxRetries: 0,
		configuration: { baseURL: cfg.baseUrl },
	});
	const structured = llm.withStructuredOutput(ExtractionSchema, {
		name: "record_expenses",
		method: "functionCalling",
		includeRaw: true,
	});

	return async (transcript, homeCurrency, earlier) => {
		const context = earlier?.trim()
			? `Said earlier in the same note (context only, its expenses are already recorded): "${earlier.trim().slice(-600)}"\n`
			: "";
		const messages = [
			{ role: "system", content: SYSTEM },
			{
				role: "user",
				content: `Home currency: ${homeCurrency}.\n${context}Transcript: ${transcript}`,
			},
		];
		const { raw, parsed } = await hedged(
			(signal) => structured.invoke(messages, { signal }),
			{
				hedgeAfterMs: 2_500,
				deadlineMs: 9_000,
			},
		);
		const usage = (
			raw as {
				usage_metadata?: { input_tokens?: number; output_tokens?: number };
			}
		).usage_metadata;
		return {
			expenses: parsed.expenses,
			inputTokens: usage?.input_tokens ?? 0,
			outputTokens: usage?.output_tokens ?? 0,
			model: cfg.model,
		};
	};
}
