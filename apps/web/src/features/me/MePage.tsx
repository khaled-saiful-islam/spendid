import { formatMinor, type Me } from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { LanguageSwitch } from "@/components/system/LanguageSwitch";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { dateLocale, t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { METHODS } from "../onboarding/options";
import { EmailSettings } from "./EmailSettings";
import { PasskeyPanel } from "./PasskeyPanel";
import { YourData } from "./YourData";

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
			t("Home currency"),
			new Intl.DisplayNames(dateLocale(), { type: "currency" }).of(
				profile.homeCurrency,
			) ?? profile.homeCurrency,
		],
		[
			t("Monthly income"),
			profile.monthlyIncomeMinor === null
				? t("Not set")
				: formatMinor(profile.monthlyIncomeMinor, profile.homeCurrency),
		],
		[t("Budget style"), method],
	];

	return (
		<div className="space-y-5">
			<PageHeader
				lead={
					<span className="grid size-12 shrink-0 place-items-center rounded-full bg-marigold font-display text-[1.15rem] font-extrabold text-plum-900">
						{initials(user.name)}
					</span>
				}
				title={user.name}
				sub={<span className="break-all">{user.email}</span>}
			/>

			<section
				aria-labelledby="money-heading"
				className="rounded-panel border border-line bg-surface p-5 sm:p-6"
			>
				<div className="flex items-center justify-between gap-3">
					<h2 id="money-heading" className="text-[1.4rem] font-bold">
						{t("Money settings")}
					</h2>
					<Link
						to="/onboarding"
						search={{ edit: true }}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						{t("Change")}
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

			<section
				aria-labelledby="language-heading"
				className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-5 sm:p-6"
			>
				<h2 id="language-heading" className="text-[1.4rem] font-bold">
					{t("Language")}
				</h2>
				<LanguageSwitch signedIn />
			</section>

			<EmailSettings />

			<PasskeyPanel />

			<YourData />

			<button
				type="button"
				onClick={signOut}
				className={buttonClass("ghost", "lg", "w-full border-2 border-line")}
			>
				<LogOut className="size-5" aria-hidden="true" /> {t("Sign out")}
			</button>
		</div>
	);
}
