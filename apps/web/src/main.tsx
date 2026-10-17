import "./styles/app.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { t } from "./i18n";
import { whenSignedOut } from "./lib/http";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPreload: "intent",
	scrollRestoration: true,
});

// A session that ends mid-use (expired, signed out on another device): back to sign in,
// with a word about why, instead of a page full of errors.
whenSignedOut(() => {
	if (!/^\/(app|admin|onboarding)(\/|$)/.test(window.location.pathname)) return;
	queryClient.clear();
	void router.navigate({
		to: "/signin",
		search: { notice: t("You were signed out. Sign in again to carry on.") },
	});
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);

// Installable app with an offline shell. Dev keeps the plain server (no stale caches).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
	});
}
