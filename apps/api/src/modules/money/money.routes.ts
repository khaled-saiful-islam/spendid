import {
	BudgetInputSchema,
	GoalDepositSchema,
	type GoalInput,
	type TransactionInput,
	type TransactionPatch,
} from "@spendid/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMember, type SessionLookup } from "../../auth/guards";
import { badRequest } from "../../http/app-error";
import type { CategoryRepository } from "./categories.repository";
import type { PlanRepository } from "./plan.repository";
import type { SummaryService } from "./summary.service";
import type { TransactionRepository } from "./transactions.repository";
import type { TransactionService } from "./transactions.service";

export interface MoneyDeps {
	session: SessionLookup;
	categories: CategoryRepository;
	transactions: TransactionRepository;
	transactionService: TransactionService;
	summary: SummaryService;
	plan: PlanRepository;
}

const IdParams = z.object({ id: z.uuid("Unknown item") });
const ListQuery = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(30),
	cursor: z.string().max(200).optional(),
	categoryId: z.uuid().optional(),
	q: z.string().trim().max(80).optional(),
});

const uid = (req: FastifyRequest): string => req.user?.id ?? "";

export async function moneyRoutes(
	app: FastifyInstance,
	deps: MoneyDeps,
): Promise<void> {
	app.addHook("preHandler", requireMember(deps.session));

	app.get("/categories", async (req) => ({
		success: true,
		data: await deps.categories.listFor(uid(req)),
	}));
	app.get("/summary", async (req) => ({
		success: true,
		data: await deps.summary.forUser(uid(req)),
	}));

	app.get("/transactions", async (req) => {
		const q = ListQuery.parse(req.query);
		const page = await deps.transactions.list(uid(req), {
			limit: q.limit,
			cursor: q.cursor,
			categoryId: q.categoryId,
			search: q.q || undefined,
		});
		return { success: true, data: page };
	});

	app.post("/transactions", async (req, reply) => {
		const created = await deps.transactionService.create(
			uid(req),
			req.body as TransactionInput,
		);
		return reply.code(201).send({ success: true, data: created });
	});

	app.patch("/transactions/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		return {
			success: true,
			data: await deps.transactionService.update(
				uid(req),
				id,
				req.body as TransactionPatch,
			),
		};
	});

	app.delete("/transactions/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		return {
			success: true,
			data: await deps.transactionService.remove(uid(req), id),
		};
	});

	app.post("/transactions/:id/restore", async (req) => {
		const { id } = IdParams.parse(req.params);
		return {
			success: true,
			data: await deps.transactionService.restore(uid(req), id),
		};
	});

	app.get("/budgets", async (req) => ({
		success: true,
		data: await deps.plan.budgets(uid(req)),
	}));

	app.put("/budgets", async (req) => {
		const input = BudgetInputSchema.parse(req.body);
		if (!(await deps.categories.isVisibleTo(uid(req), input.categoryId)))
			throw badRequest("Pick one of your categories.");
		await deps.plan.setBudget(uid(req), input);
		return { success: true, data: await deps.plan.budgets(uid(req)) };
	});

	app.get("/goals", async (req) => ({
		success: true,
		data: await deps.plan.goals(uid(req)),
	}));

	app.post("/goals", async (req, reply) => {
		const created = await deps.plan.createGoal(uid(req), req.body as GoalInput);
		return reply.code(201).send({ success: true, data: created });
	});

	app.put("/goals/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		return {
			success: true,
			data: await deps.plan.updateGoal(uid(req), id, req.body as GoalInput),
		};
	});

	app.post("/goals/:id/deposit", async (req) => {
		const { id } = IdParams.parse(req.params);
		const { amountMinor } = GoalDepositSchema.parse(req.body);
		return {
			success: true,
			data: await deps.plan.deposit(uid(req), id, amountMinor),
		};
	});

	app.delete("/goals/:id", async (req) => {
		const { id } = IdParams.parse(req.params);
		await deps.plan.archiveGoal(uid(req), id);
		return { success: true, data: null };
	});
}
