import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AdminHome } from "@/features/admin/AdminHome";
import { requireAdmin } from "@/lib/guards";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/admin")({
	beforeLoad: ({ context }) => requireAdmin(context.queryClient),
	component: function AdminRoute() {
		const { data: me } = useSuspenseQuery(meQuery);
		return me ? <AdminHome me={me} /> : null;
	},
});
