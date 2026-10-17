import type {
	BudgetInput,
	BudgetLine,
	Category,
	Goal,
	GoalInput,
	Summary,
	Transaction,
	TransactionInput,
	TransactionPage,
	TransactionPatch,
} from "@spendid/shared";
import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import { t } from "@/i18n";
import { api } from "./http";

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	body: body === undefined ? undefined : JSON.stringify(body),
});

export const categoriesQuery = queryOptions({
	queryKey: ["categories"],
	// Category names show in the app language (names with no translation stay as they are).
	queryFn: async () =>
		(await api<Category[]>("/api/categories")).map((c) => ({
			...c,
			name: t(c.name),
		})),
	staleTime: Number.POSITIVE_INFINITY,
});

export const summaryQuery = queryOptions({
	queryKey: ["summary"],
	queryFn: () => api<Summary>("/api/summary"),
	staleTime: 15_000,
});

export interface ActivityFilters {
	categoryId?: string;
	q?: string;
}

export const transactionsQuery = (filters: ActivityFilters) =>
	infiniteQueryOptions({
		queryKey: ["transactions", filters],
		initialPageParam: "",
		queryFn: ({ pageParam }) => {
			const params = new URLSearchParams({ limit: "30" });
			if (pageParam) params.set("cursor", pageParam);
			if (filters.categoryId) params.set("categoryId", filters.categoryId);
			if (filters.q) params.set("q", filters.q);
			return api<TransactionPage>(`/api/transactions?${params}`);
		},
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});

export const budgetsQuery = queryOptions({
	queryKey: ["budgets"],
	queryFn: () => api<BudgetLine[]>("/api/budgets"),
});

export const goalsQuery = queryOptions({
	queryKey: ["goals"],
	queryFn: () => api<Goal[]>("/api/goals"),
});

export const moneyApi = {
	addTransaction: (input: TransactionInput) =>
		api<Transaction>("/api/transactions", json("POST", input)),
	updateTransaction: (id: string, patch: TransactionPatch) =>
		api<Transaction>(`/api/transactions/${id}`, json("PATCH", patch)),
	deleteTransaction: (id: string) =>
		api<Transaction>(`/api/transactions/${id}`, json("DELETE")),
	restoreTransaction: (id: string) =>
		api<Transaction>(`/api/transactions/${id}/restore`, json("POST")),
	setBudget: (input: BudgetInput) =>
		api<BudgetLine[]>("/api/budgets", json("PUT", input)),
	createGoal: (input: GoalInput) =>
		api<Goal>("/api/goals", json("POST", input)),
	updateGoal: (id: string, input: GoalInput) =>
		api<Goal>(`/api/goals/${id}`, json("PUT", input)),
	depositGoal: (id: string, amountMinor: number) =>
		api<Goal>(`/api/goals/${id}/deposit`, json("POST", { amountMinor })),
	archiveGoal: (id: string) => api<null>(`/api/goals/${id}`, json("DELETE")),
};

/** After any money change: refresh the numbers that depend on it. */
export function refreshMoney(queryClient: QueryClient): Promise<void> {
	return Promise.all(
		["summary", "transactions", "goals", "budgets", "insights"].map((key) =>
			queryClient.invalidateQueries({ queryKey: [key] }),
		),
	).then(() => undefined);
}
