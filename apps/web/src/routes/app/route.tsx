import { createFileRoute } from "@tanstack/react-router";
import { AppLock } from "@/features/lock/AppLock";
import { AppShell } from "@/features/shell/AppShell";
import { requireMember } from "@/lib/guards";

export const Route = createFileRoute("/app")({
	beforeLoad: ({ context }) => requireMember(context.queryClient),
	component: () => (
		<AppLock>
			<AppShell />
		</AppLock>
	),
});
