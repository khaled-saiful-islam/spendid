import { createFileRoute } from "@tanstack/react-router";
import { ResetPage } from "@/features/auth/ResetPage";
import { optionalString } from "@/lib/guards";

export const Route = createFileRoute("/reset")({
	validateSearch: (
		search: Record<string, unknown>,
	): { token?: string; error?: string } => ({
		token: optionalString(search.token),
		error: optionalString(search.error),
	}),
	component: function ResetRoute() {
		const { token, error } = Route.useSearch();
		return <ResetPage token={token} linkError={error} />;
	},
});
