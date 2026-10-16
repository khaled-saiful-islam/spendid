import { createFileRoute } from "@tanstack/react-router";
import { ForgotPage } from "@/features/auth/ForgotPage";

export const Route = createFileRoute("/forgot")({
	component: ForgotPage,
});
