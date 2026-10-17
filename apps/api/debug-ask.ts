import { ChatOpenAI } from "@langchain/openai";
import { createDb } from "@spendid/db";
import { AIMessage, createAgent, createMiddleware, HumanMessage } from "langchain";
import { createAskTools } from "./src/modules/ask/ask.tools";
import { repairToolCalls } from "./src/modules/ask/repair-tool-calls";
import { createCategoryRepository } from "./src/modules/money/categories.repository";
import { createPlanRepository } from "./src/modules/money/plan.repository";
import { createSummaryService } from "./src/modules/money/summary.service";

const userId = process.argv[2] ?? "";
const q = process.argv[3] ?? "Create a goal: new laptop, RM 5000, by June 2027";
const db = createDb(process.env.DATABASE_URL ?? "", 2).db;
const llm = new ChatOpenAI({ model: process.env.ILMU_TEXT_MODEL, apiKey: process.env.ILMU_API_KEY, temperature: 0.2, configuration: { baseURL: process.env.ILMU_BASE_URL } });
const side = { charts: [], drafts: [], actions: [] };
const tools = createAskTools({ db, summary: createSummaryService(db), plan: createPlanRepository(db) }, { userId, timeZone: "Asia/Kuala_Lumpur", homeCurrency: "MYR", categories: await createCategoryRepository(db).listFor(userId) }, side);
const repair = createMiddleware({ name: "R", wrapModelCall: async (req, h) => repairToolCalls((await h(req)) as AIMessage) });
const agent = createAgent({ model: llm, tools, middleware: [repair], systemPrompt: "You are a money assistant. To create things use the propose tools; they show a card the person confirms. Today is 2026-10-17." });
const stream = await agent.stream({ messages: [new HumanMessage(q)] }, { streamMode: "updates", recursionLimit: 12 });
try {
for await (const u of stream) {
	for (const [node, v] of Object.entries(u as Record<string, { messages?: { content: unknown; tool_calls?: unknown; invalid_tool_calls?: unknown }[] }>)) {
		for (const m of v?.messages ?? []) console.log(node, JSON.stringify(m.content).slice(0, 200), JSON.stringify(m.tool_calls ?? "").slice(0, 300), JSON.stringify(m.invalid_tool_calls ?? "").slice(0, 300));
	}
}
} catch (e) { console.log("ERR", String(e).slice(0, 200)); }
console.log("ACTIONS", JSON.stringify(side.actions));
process.exit(0);
