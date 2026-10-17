import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsPage } from "@/features/subscriptions/SubscriptionsPage";

export const Route = createFileRoute("/app/subscriptions")({
	component: SubscriptionsPage,
});
