import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/activity/ActivityPage";

export const Route = createFileRoute("/app/activity")({
	validateSearch: (search: Record<string, unknown>): { view?: "insights" } =>
		search.view === "insights" ? { view: "insights" } : {},
	component: function ActivityRoute() {
		const { view } = Route.useSearch();
		return <ActivityPage view={view ?? "expenses"} />;
	},
});
