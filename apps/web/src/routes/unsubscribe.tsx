import { createFileRoute } from "@tanstack/react-router";
import { UnsubscribePage } from "@/features/auth/UnsubscribePage";
import { optionalString } from "@/lib/guards";

export const Route = createFileRoute("/unsubscribe")({
	validateSearch: (
		search: Record<string, unknown>,
	): { u?: string; g?: string; t?: string } => ({
		u: optionalString(search.u),
		g: optionalString(search.g),
		t: optionalString(search.t),
	}),
	component: function UnsubscribeRoute() {
		const search = Route.useSearch();
		return <UnsubscribePage {...search} />;
	},
});
