import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { requireMe } from "@/lib/guards";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/onboarding")({
	validateSearch: (search: Record<string, unknown>): { edit?: boolean } => ({
		edit: search.edit === true || search.edit === "true" ? true : undefined,
	}),
	beforeLoad: async ({ context, search }) => {
		const me = await requireMe(context.queryClient);
		if (me.user.role === "admin") throw redirect({ to: "/admin" });
		if (!me.needsOnboarding && !search.edit) throw redirect({ to: "/app" });
	},
	component: function OnboardingRoute() {
		const { data: me } = useSuspenseQuery(meQuery);
		return me ? <OnboardingPage me={me} /> : null;
	},
});
