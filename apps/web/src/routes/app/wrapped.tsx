import { createFileRoute } from "@tanstack/react-router";
import { WrappedStory } from "@/features/wrapped/WrappedStory";
import { thisMonth } from "@/lib/insights-api";

export const Route = createFileRoute("/app/wrapped")({
	validateSearch: (search: Record<string, unknown>): { month?: string } =>
		typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
			? { month: search.month }
			: {},
	component: function WrappedRoute() {
		const { month } = Route.useSearch();
		return <WrappedStory month={month ?? thisMonth()} />;
	},
});
