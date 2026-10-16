import type { Me } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { authClient } from "@/lib/auth-client";

/** Admin landing. Manages accounts and the app; has no route to anyone's money. */
export function AdminHome({ me }: { me: Me }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: total } = useQuery({
		queryKey: ["admin", "user-count"],
		queryFn: async () => {
			const { data } = await authClient.admin.listUsers({
				query: { limit: 1 },
			});
			return data?.total ?? 0;
		},
	});

	async function signOut() {
		await authClient.signOut();
		queryClient.clear();
		await navigate({ to: "/" });
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
			<header className="flex items-center justify-between gap-3">
				<Logo />
				<div className="flex items-center gap-1">
					<ThemeToggle />
					<button
						type="button"
						onClick={signOut}
						className={buttonClass("ghost", "md")}
					>
						<LogOut className="size-5" aria-hidden="true" /> Sign out
					</button>
				</div>
			</header>

			<h1 className="mt-10 text-[clamp(2rem,6vw,2.8rem)] font-extrabold">
				Hello, {me.user.name}
			</h1>
			<p className="mt-2 max-w-[60ch] text-ink-soft">
				You manage people's accounts and the app. Spending, receipts and family
				details stay private to each person.
			</p>

			<div className="mt-8 grid gap-4 sm:grid-cols-2">
				<div className="rounded-panel bg-plum-900 p-6 text-plum-50 dark:bg-plum-800">
					<Users className="size-6 text-marigold" aria-hidden="true" />
					<p className="num mt-4 text-[3rem] leading-none font-extrabold">
						{total ?? "…"}
					</p>
					<p className="mt-2 text-plum-200">People with an account</p>
				</div>
				<div className="rounded-panel border border-line bg-surface p-6">
					<ShieldCheck className="size-6 text-safe" aria-hidden="true" />
					<p className="mt-4 font-display text-[1.3rem] font-bold">
						Privacy by design
					</p>
					<p className="mt-2 text-ink-soft">
						No "log in as user", no password or email changes. Admins can't take
						over accounts.
					</p>
				</div>
			</div>

			<div className="mt-6">
				<EmptyState
					icon={Users}
					title="Admin console"
					body="Find people, pause or restore accounts, set AI limits, and watch AI and email health."
					milestone="M6"
					level={2}
				/>
			</div>
		</div>
	);
}
