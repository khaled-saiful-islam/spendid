import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AdminConsole } from "@/features/admin/AdminConsole";
import { requireAdmin } from "@/lib/guards";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/admin")({
	beforeLoad: ({ context }) => requireAdmin(context.queryClient),
	component: function AdminRoute() {
		const { data: me } = useSuspenseQuery(meQuery);
		return me ? <AdminConsole me={me} /> : null;
	},
});
