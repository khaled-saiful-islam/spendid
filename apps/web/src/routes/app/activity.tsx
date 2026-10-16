import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/activity/ActivityPage";

export const Route = createFileRoute("/app/activity")({
	component: ActivityPage,
});
