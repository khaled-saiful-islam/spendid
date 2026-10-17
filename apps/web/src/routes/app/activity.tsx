import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/activity/ActivityPage";

interface ActivitySearch {
	view?: "insights";
	/** Open the expenses list already filtered to this category. */
	category?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/app/activity")({
	validateSearch: (search: Record<string, unknown>): ActivitySearch => {
		if (search.view === "insights") return { view: "insights" };
		return typeof search.category === "string" && UUID.test(search.category)
			? { category: search.category }
			: {};
	},
	component: function ActivityRoute() {
		const { view, category } = Route.useSearch();
		return (
			<ActivityPage view={view ?? "expenses"} initialCategory={category} />
		);
	},
});
