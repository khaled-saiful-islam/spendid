import { formatMinor } from "@spendid/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui/Button";
import { t } from "@/i18n";
import { publicSplitQuery } from "@/lib/family-api";
import { formatMoment } from "@/lib/time";
import { SplitSummary } from "./SplitSummary";

/** The page behind a split link: who owes what. No sign-in, nothing beyond this bill. */
export function PublicSplitPage({ token }: { token: string }) {
	const { data, isPending, error } = useQuery(publicSplitQuery(token));
	return (
		<div className="min-h-dvh bg-bg">
			<header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
				<Link to="/" aria-label={t("Spendid home")}>
					<Logo />
				</Link>
			</header>
			<main className="mx-auto max-w-3xl space-y-6 px-4 pb-16">
				{isPending ? (
					<div className="h-64 animate-pulse rounded-panel bg-surface-2" />
				) : error || !data ? (
					<div className="space-y-3 rounded-panel border border-line bg-surface p-6">
						<h1 className="text-[1.8rem] font-bold">
							{t("This split link doesn't work")}
						</h1>
						<p className="text-ink-soft">
							{t(
								"Links stop working after 60 days, or when the split is deleted. Ask the person who sent it for the amounts.",
							)}
						</p>
					</div>
				) : (
					<>
						<div className="relative overflow-hidden rounded-panel bg-linear-to-br from-plum-500 via-plum-700 to-plum-900 p-6 text-white shadow-lift">
							<div
								className="bg-scales pointer-events-none absolute inset-0 opacity-20"
								aria-hidden="true"
							/>
							<p className="relative text-white/80">
								{t("{name} split this bill on {date}", {
									name: data.ownerName,
									date: formatMoment(data.createdAt, {
										day: "numeric",
										month: "long",
										year: "numeric",
									}),
								})}
							</p>
							<h1 className="relative mt-1 text-[clamp(2rem,7vw,2.8rem)] leading-tight font-bold break-words">
								{data.title}
							</h1>
							<p className="num relative mt-3 text-[1.6rem] font-extrabold">
								{formatMinor(data.result.totalMinor, data.currency)}
							</p>
						</div>
						<SplitSummary split={data} />
						<div className="rounded-panel border border-line bg-surface p-5 text-center">
							<p className="font-semibold">
								{t("Split your own bills in seconds.")}
							</p>
							<Link to="/" className={buttonClass("coin", "lg", "mt-3")}>
								{t("Try Spendid")}
							</Link>
						</div>
					</>
				)}
			</main>
		</div>
	);
}
