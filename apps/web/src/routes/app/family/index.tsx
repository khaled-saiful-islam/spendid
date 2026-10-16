import { createFileRoute } from "@tanstack/react-router";
import { FamilyPage } from "@/features/family/FamilyPage";

export const Route = createFileRoute("/app/family/")({
	component: FamilyPage,
});
