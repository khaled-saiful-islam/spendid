import { formatMinor, type RecurringOverview } from "@spendid/shared";
import { CalendarClock, Repeat, TrendingUp } from "lucide-react";
import { CategoryIcon } from "@/components/money/CategoryIcon";

const CADENCE = {
	weekly: "Every week",
	monthly: "Every month",
	yearly: "Every year",
} as const;
const shortDay = (day: string) =>
	new Date(`${day}T12:00`).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});

/** Subscriptions and bills Spendid found, price rises flagged, and what's still due this month. */
export function Subscriptions({ data }: { data: RecurringOverview }) {
	const money = (minor: number) => formatMinor(minor, data.currency);
	return (
		<section aria-labelledby="subs-heading" className="space-y-4">
			<div>
				<h2
					id="subs-heading"
					className="flex items-center gap-2 text-[1.5rem] font-bold"
				>
					<Repeat className="size-6 text-plum-500" aria-hidden="true" />{" "}
					Subscriptions and bills
				</h2>
				<p className="text-ink-soft">
					{data.items.length === 0
						? "Once the same shop charges you on a steady rhythm, it shows up here."
						: `About ${money(data.monthlyMinor)} a month, found from your spending.`}
				</p>
			</div>
			{data.billsDue.minor > 0 && (
				<div className="flex gap-3 rounded-panel bg-linear-to-br from-marigold/25 to-coral/15 p-4">
					<CalendarClock
						className="mt-0.5 size-6 shrink-0 text-marigold-deep"
						aria-hidden="true"
					/>
					<div className="min-w-0">
						<p className="font-semibold">
							Still due this month: {money(data.billsDue.minor)}
						</p>
						<p className="text-[0.92rem] text-ink-soft">
							{data.billsDue.items
								.map((b) => `${b.merchant} on ${shortDay(b.day)}`)
								.join(", ")}
							. Already kept aside in your safe-to-spend.
						</p>
					</div>
				</div>
			)}
			{data.items.length > 0 && (
				<ul className="divide-y divide-line rounded-panel border border-line bg-surface">
					{data.items.map((r) => {
						const rise =
							r.previousAmountMinor !== null
								? r.amountMinor - r.previousAmountMinor
								: 0;
						return (
							<li key={r.merchantKey} className="flex items-center gap-3 p-3">
								<CategoryIcon icon={r.icon} tint={r.tint} />
								<span className="min-w-0 flex-1">
									<span className="block font-semibold break-words">
										{r.merchant}
									</span>
									<span className="block text-[0.85rem] text-ink-soft">
										{CADENCE[r.cadence]}, next around {shortDay(r.nextDay)}
									</span>
									{rise > 0 && (
										<span className="mt-1 inline-flex items-center gap-1 rounded-full bg-coral/12 px-2.5 py-0.5 text-[0.82rem] font-semibold text-over">
											<TrendingUp className="size-3.5" aria-hidden="true" />{" "}
											Went up {money(rise)}
										</span>
									)}
								</span>
								<span className="num shrink-0 font-bold">
									{money(r.amountMinor)}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
