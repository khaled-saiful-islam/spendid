import { createFileRoute } from "@tanstack/react-router";
import { CircleUserRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const Route = createFileRoute("/app/me")({
	component: () => (
		<EmptyState
			icon={CircleUserRound}
			title="Me"
			body="Your profile, home currency, budget style, app lock, email settings, and export or delete your data."
			milestone="M1"
		/>
	),
});
