import { createFileRoute } from "@tanstack/react-router";
import { SplitPage } from "@/features/family/split/SplitPage";

export const Route = createFileRoute("/app/family/split")({
	component: SplitPage,
});
