import { createFileRoute } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const Route = createFileRoute("/app/family")({
	component: () => (
		<EmptyState
			icon={UsersRound}
			title="Family"
			body="Invite your partner, parents or kids, choose what each of you shares, and save toward goals together."
			milestone="M7"
		/>
	),
});
