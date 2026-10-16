import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<MotionConfig reducedMotion="user">
			<Outlet />
		</MotionConfig>
	),
});
