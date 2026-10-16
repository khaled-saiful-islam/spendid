import { createFileRoute } from "@tanstack/react-router";
import { CheckEmailPage } from "@/features/auth/CheckEmailPage";
import { optionalString } from "@/lib/guards";

export const Route = createFileRoute("/check-email")({
	validateSearch: (search: Record<string, unknown>): { email?: string } => ({
		email: optionalString(search.email),
	}),
	component: function CheckEmailRoute() {
		const { email } = Route.useSearch();
		return <CheckEmailPage email={email} />;
	},
});
