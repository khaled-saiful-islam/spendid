import { createFileRoute } from "@tanstack/react-router";
import { JoinPage } from "@/features/family/JoinPage";

export const Route = createFileRoute("/join/$token")({
	component: function JoinRoute() {
		const { token } = Route.useParams();
		return <JoinPage token={token} />;
	},
});
