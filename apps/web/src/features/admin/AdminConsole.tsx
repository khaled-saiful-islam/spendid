import type { Me } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { buttonClass } from "@/components/ui/Button";
import { Toaster } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { AuditTab } from "./AuditTab";
import { OverviewTab } from "./OverviewTab";
import { PeopleTab } from "./PeopleTab";

const TABS = [
	{ id: "overview", label: "Overview" },
	{ id: "people", label: "People" },
	{ id: "audit", label: "Activity log" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Admin console: manage the app and accounts. There is no view of anyone's money. */
export function AdminConsole({ me }: { me: Me }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<Tab>("overview");

	async function signOut() {
		await authClient.signOut();
		queryClient.clear();
		await navigate({ to: "/" });
	}

	return (
		<div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
			<header className="flex items-center justify-between gap-3">
				<span className="flex items-center gap-3">
					<Logo />
					<span className="rounded-full bg-plum-900 px-2.5 py-1 text-[0.75rem] font-semibold text-marigold dark:bg-plum-50 dark:text-plum-900">
						Admin
					</span>
				</span>
				<div className="flex items-center gap-1">
					<ThemeToggle />
					<button
						type="button"
						onClick={signOut}
						className={buttonClass("ghost", "md")}
					>
						<LogOut className="size-5" aria-hidden="true" />{" "}
						<span className="hidden sm:inline">Sign out</span>
					</button>
				</div>
			</header>

			<div className="mt-8 flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-[clamp(2rem,6vw,2.6rem)] font-extrabold">
						Hello, {me.user.name}
					</h1>
					<p className="mt-1 flex items-center gap-2 text-ink-soft">
						<ShieldCheck className="size-4 text-safe" aria-hidden="true" /> You
						manage accounts and the app. Spending stays private to each person.
					</p>
				</div>
			</div>

			<div
				role="tablist"
				aria-label="Admin sections"
				className="mt-6 flex gap-1 overflow-x-auto border-b border-line"
			>
				{TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						onClick={() => setTab(t.id)}
						className={cn(
							"relative h-12 shrink-0 px-4 font-semibold",
							tab === t.id ? "text-ink" : "text-ink-soft hover:text-ink",
						)}
					>
						{t.label}
						{tab === t.id && (
							<motion.span
								layoutId="admin-tab"
								className="absolute inset-x-2 -bottom-px h-1 rounded-full bg-marigold"
							/>
						)}
					</button>
				))}
			</div>

			<div role="tabpanel" className="py-6">
				{tab === "overview" && <OverviewTab />}
				{tab === "people" && <PeopleTab />}
				{tab === "audit" && <AuditTab />}
			</div>
			<Toaster />
		</div>
	);
}
