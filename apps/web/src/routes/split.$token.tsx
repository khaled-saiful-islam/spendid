import { createFileRoute } from "@tanstack/react-router";
import { PublicSplitPage } from "@/features/family/split/PublicSplitPage";

export const Route = createFileRoute("/split/$token")({
	component: function SplitLinkRoute() {
		const { token } = Route.useParams();
		return <PublicSplitPage token={token} />;
	},
});
