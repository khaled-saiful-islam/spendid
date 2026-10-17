import type {
	Subscription,
	SubscriptionInput,
	SubscriptionOverview,
	Transaction,
} from "@spendid/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "./http";
import { refreshMoney } from "./money-api";

export const subscriptionsQuery = queryOptions({
	queryKey: ["subscriptions"],
	queryFn: () => api<SubscriptionOverview>("/api/subscriptions"),
});

const json = (method: string, body?: unknown): RequestInit => ({
	method,
	body: JSON.stringify(body ?? {}),
});

export const subscriptionsApi = {
	create: (input: SubscriptionInput) =>
		api<Subscription>("/api/subscriptions", json("POST", input)),
	update: (id: string, input: SubscriptionInput) =>
		api<Subscription>(`/api/subscriptions/${id}`, json("PUT", input)),
	markPaid: (id: string, amountMinor?: number) =>
		api<{ subscription: Subscription; expense: Transaction }>(
			`/api/subscriptions/${id}/paid`,
			json("POST", amountMinor ? { amountMinor } : {}),
		),
	cancel: (id: string) =>
		api<Subscription>(`/api/subscriptions/${id}/cancel`, json("POST")),
	restore: (id: string) =>
		api<Subscription>(`/api/subscriptions/${id}/restore`, json("POST")),
	remove: (id: string) => api<null>(`/api/subscriptions/${id}`, json("DELETE")),
};

/** Subscriptions change safe-to-spend (kept aside) and, when paid, spending. */
export function refreshSubscriptions(queryClient: QueryClient): Promise<void> {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: subscriptionsQuery.queryKey }),
		refreshMoney(queryClient),
	]).then(() => undefined);
}
