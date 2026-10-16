import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MePage } from "@/features/me/MePage";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/app/me")({
	component: function MeRoute() {
		const { data: me } = useSuspenseQuery(meQuery);
		return me ? <MePage me={me} /> : null;
	},
});
