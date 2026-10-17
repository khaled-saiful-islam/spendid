import { formatMinor } from "@spendid/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/i18n";
import { transactionsQuery } from "@/lib/money-api";
import { formatDay } from "@/lib/time";
import { TransactionRow, useCategoryMap } from "../money/TransactionRow";

/** One day's expenses in a sheet, newest first; tap one to edit it. */
export function DayExpensesSheet({
	day,
	currency,
	onClose,
}: {
	day: string | null;
	currency: string;
	onClose: () => void;
}) {
	return (
		<Sheet
			open={day !== null}
			onClose={onClose}
			title={
				day
					? formatDay(day, { weekday: "long", day: "numeric", month: "long" })
					: ""
			}
		>
			{day && <DayList day={day} currency={currency} onOpen={onClose} />}
		</Sheet>
	);
}

function DayList({
	day,
	currency,
	onOpen,
}: {
	day: string;
	currency: string;
	onOpen: () => void;
}) {
	const categories = useCategoryMap();
	const query = useInfiniteQuery(transactionsQuery({ day }));
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];
	const total = items.reduce((s, i) => s + i.homeAmountMinor, 0);

	if (query.isPending)
		return <div className="h-32 animate-pulse rounded-tile bg-surface-2" />;
	if (query.isError)
		return (
			<p className="text-over">{t("Couldn't load this day. Try again.")}</p>
		);
	if (items.length === 0)
		return <p className="text-ink-soft">{t("No spending on this day.")}</p>;

	return (
		<>
			<p data-money className="-mt-2 mb-2 text-ink-soft">
				{t(
					items.length === 1 ? "{amount}, 1 expense" : "{amount}, {n} expenses",
					{ amount: formatMinor(total, currency), n: items.length },
				)}
			</p>
			<ul>
				{items.map((item) => (
					<TransactionRow
						key={item.id}
						t={item}
						category={categories.get(item.categoryId)}
						onOpen={onOpen}
					/>
				))}
			</ul>
			{query.hasNextPage && (
				<button
					type="button"
					onClick={() => void query.fetchNextPage()}
					disabled={query.isFetchingNextPage}
					className="mt-1 w-full rounded-tile py-2.5 text-[0.9rem] font-semibold text-ink-soft hover:bg-surface-2 disabled:opacity-50"
				>
					{t("Show more")}
				</button>
			)}
		</>
	);
}
