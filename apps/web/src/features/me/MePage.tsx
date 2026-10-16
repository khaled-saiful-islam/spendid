import { formatMinor, type Me } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";
import { METHODS } from "../onboarding/options";
import { EmailSettings } from "./EmailSettings";
import { PasskeyPanel } from "./PasskeyPanel";

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");
}

export function MePage({ me }: { me: Me }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { user, profile } = me;
	const method =
		METHODS.find((m) => m.id === profile.budgetMethod)?.title ?? "—";

	async function signOut() {
		await authClient.signOut();
		queryClient.clear();
		await navigate({ to: "/" });
	}

	const rows: [string, string][] = [
		[
			"Home currency",
			new Intl.DisplayNames(undefined, { type: "currency" }).of(
				profile.homeCurrency,
			) ?? profile.homeCurrency,
		],
		[
			"Monthly income",
			profile.monthlyIncomeMinor === null
				? "Not set"
				: formatMinor(profile.monthlyIncomeMinor, profile.homeCurrency),
		],
		["Budget style", method],
		["Language", profile.locale === "ms" ? "Bahasa Melayu" : "English"],
	];

	return (
		<div className="space-y-6">
			<section className="bg-scales flex flex-wrap items-center gap-4 rounded-panel bg-plum-900 p-6 text-plum-50 dark:bg-plum-800">
				<span className="grid size-16 shrink-0 place-items-center rounded-full bg-marigold font-display text-[1.5rem] font-extrabold text-plum-900">
					{initials(user.name)}
				</span>
				<div className="min-w-0 flex-1">
					<h1 className="text-[1.9rem] font-extrabold break-words">
						{user.name}
					</h1>
					<p className="break-all text-plum-200">{user.email}</p>
				</div>
			</section>

			<section
				aria-labelledby="money-heading"
				className="rounded-panel border border-line bg-surface p-5 sm:p-6"
			>
				<div className="flex items-center justify-between gap-3">
					<h2 id="money-heading" className="text-[1.4rem] font-bold">
						Money settings
					</h2>
					<Link
						to="/onboarding"
						search={{ edit: true }}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						Change
					</Link>
				</div>
				<dl className="mt-4 divide-y divide-line">
					{rows.map(([label, value]) => (
						<div
							key={label}
							className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3"
						>
							<dt className="text-ink-soft">{label}</dt>
							<dd className="font-semibold">{value}</dd>
						</div>
					))}
				</dl>
			</section>

			<EmailSettings />

			<PasskeyPanel />

			<button
				type="button"
				onClick={signOut}
				className={buttonClass("ghost", "lg", "w-full border-2 border-line")}
			>
				<LogOut className="size-5" aria-hidden="true" /> Sign out
			</button>
		</div>
	);
}
