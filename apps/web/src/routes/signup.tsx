import { createFileRoute } from "@tanstack/react-router";
import { SignUpPage } from "@/features/auth/SignUpPage";
import { redirectIfSignedIn } from "@/lib/guards";

export const Route = createFileRoute("/signup")({
	beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
	component: SignUpPage,
});
