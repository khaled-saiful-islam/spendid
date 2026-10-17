import { formatMinor } from "@spendid/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { t } from "@/i18n";
import { transactionsQuery } from "@/lib/money-api";
import { formatDay } from "@/lib/time";
import { TransactionRow, useCategoryMap } from "../money/TransactionRow";

/** Every expense on one day, newest first; tap one to edit it. */
export function DayExpenses({
	day,
	currency,
}: {
	day: string;
	currency: string;
}) {
	const categories = useCategoryMap();
	const query = useInfiniteQuery(transactionsQuery({ day }));
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];
	const total = items.reduce((s, i) => s + i.homeAmountMinor, 0);
	const title = formatDay(day, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

	return (
		<section
			aria-label={t("Expenses on {day}", { day: title })}
			className="rounded-tile border border-line bg-bg/40 p-2"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 pt-1">
				<h3 className="font-sans text-[0.95rem] font-semibold">{title}</h3>
				{items.length > 0 && (
					<span
						data-money
						className="num text-[0.9rem] font-semibold text-ink-soft"
					>
						{formatMinor(total, currency)}
					</span>
				)}
			</div>
			{query.isPending ? (
				<div className="m-2 h-14 animate-pulse rounded-tile bg-surface-2" />
			) : query.isError ? (
				<p className="px-2 py-3 text-[0.92rem] text-over">
					{t("Couldn't load this day. Try again.")}
				</p>
			) : items.length === 0 ? (
				<p className="px-2 py-3 text-[0.92rem] text-ink-soft">
					{t("No spending on this day.")}
				</p>
			) : (
				<ul className="mt-1">
					{items.map((item) => (
						<TransactionRow
							key={item.id}
							t={item}
							category={categories.get(item.categoryId)}
						/>
					))}
				</ul>
			)}
			{query.hasNextPage && (
				<button
					type="button"
					onClick={() => void query.fetchNextPage()}
					disabled={query.isFetchingNextPage}
					className="mt-1 w-full rounded-tile py-2 text-[0.9rem] font-semibold text-ink-soft hover:bg-surface-2 disabled:opacity-50"
				>
					{t("Show more")}
				</button>
			)}
		</section>
	);
}
