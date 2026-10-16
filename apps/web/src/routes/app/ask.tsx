import { createFileRoute } from "@tanstack/react-router";
import { AskPage } from "@/features/ask/AskPage";
import { optionalString } from "@/lib/guards";

export const Route = createFileRoute("/app/ask")({
	validateSearch: (search: Record<string, unknown>): { q?: string } => ({
		q: optionalString(search.q),
	}),
	component: function AskRoute() {
		const { q } = Route.useSearch();
		return <AskPage initialQuestion={q} />;
	},
});
