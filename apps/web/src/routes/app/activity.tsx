import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const Route = createFileRoute("/app/activity")({
	component: () => (
		<EmptyState
			icon={ReceiptText}
			title="Activity"
			body="Every expense you log, grouped by day, with search and filters by category, person and currency."
			milestone="M2"
		/>
	),
});
