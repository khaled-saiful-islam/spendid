import { createFileRoute } from "@tanstack/react-router";
import { PersonPage } from "@/features/family/PersonPage";

export const Route = createFileRoute("/app/family/$userId")({
	component: function PersonRoute() {
		const { userId } = Route.useParams();
		return <PersonPage userId={userId} />;
	},
});
