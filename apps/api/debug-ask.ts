import { createDb } from "@spendid/db";
import { createAskAgent } from "./src/modules/ask/ask.agent";
import { createCategoryRepository } from "./src/modules/money/categories.repository";
import { createPlanRepository } from "./src/modules/money/plan.repository";
import { createSummaryService } from "./src/modules/money/summary.service";

const userId = process.argv[2] ?? "";
const db = createDb(process.env.DATABASE_URL ?? "", 2).db;
const guard = { assertAllowed: async () => {}, record: async () => {} } as never;
const ask = createAskAgent({
	db, guard, categories: createCategoryRepository(db), summary: createSummaryService(db), plan: createPlanRepository(db),
	ilmu: { baseUrl: process.env.ILMU_BASE_URL ?? "", apiKey: process.env.ILMU_API_KEY ?? "", model: process.env.ILMU_TEXT_MODEL ?? "" },
});
const history = [
	{ role: "user" as const, text: "Create a goal: new phone, RM 3000, by March 2027" },
	{ role: "assistant" as const, text: "I've prepared your new phone savings goal for RM 3,000 by March 2027. It's ready to confirm.\n(This answer's card came from calling propose_goal.)" },
];
for await (const e of ask(userId, { question: process.argv[3] ?? "Put 50 into my Rainy-day fund", history }, new AbortController().signal)) {
	console.log(JSON.stringify(e).slice(0, 300));
}
process.exit(0);
