import { createFileRoute } from "@tanstack/react-router";
import { SignInPage } from "@/features/auth/SignInPage";
import { optionalString, redirectIfSignedIn } from "@/lib/guards";

export const Route = createFileRoute("/signin")({
	validateSearch: (search: Record<string, unknown>): { notice?: string } => ({
		notice: optionalString(search.notice),
	}),
	beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
	component: function SignInRoute() {
		const { notice } = Route.useSearch();
		return <SignInPage notice={notice} />;
	},
});
