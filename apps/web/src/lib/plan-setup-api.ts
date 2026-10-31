import type { PlanPreview, PlanSetup, PlanSetupInput } from "@spendid/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/http";

/** Period, current cycle, salary and plan style (the "Your plan" sheet). */
export const planSetupQuery = queryOptions({
	queryKey: ["plan-setup"],
	queryFn: () => api<PlanSetup>("/api/plan/setup"),
	staleTime: 15_000,
});

const send = <T>(path: string, method: "PUT" | "POST", body?: unknown) =>
	api<T>(path, {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
	});

export const planSetupApi = {
	save: (input: PlanSetupInput) =>
		send<PlanSetup>("/api/plan/setup", "PUT", input),
	preview: (input: PlanSetupInput) =>
		send<PlanPreview>("/api/plan/setup/preview", "POST", input),
	confirm: () => send<PlanSetup>("/api/plan/cycle/confirm", "POST"),
};

/** Everything a plan change touches. */
export async function refreshPlan(queryClient: QueryClient): Promise<void> {
	await Promise.all(
		["summary", "plan-setup", "goals", "budgets", "transfers", "me"].map(
			(key) => queryClient.invalidateQueries({ queryKey: [key] }),
		),
	);
}
