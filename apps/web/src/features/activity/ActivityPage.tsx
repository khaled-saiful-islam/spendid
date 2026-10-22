import { formatMinor, type Transaction } from "@spendid/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, LoaderCircle, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { categoriesQuery, PAGE_SIZE, transactionsQuery } from "@/lib/money-api";
import { addDays, appToday, formatDay } from "@/lib/time";
import { capture } from "../capture/capture-store";
import { localDate } from "../capture/draft";
import { InsightsView } from "../insights/InsightsView";
import { TransactionRow, useCategoryMap } from "../money/TransactionRow";

interface DayGroup {
	day: string;
	items: Transaction[];
	totalMinor: number;
	currency: string;
}

function groupByDay(items: Transaction[]): DayGroup[] {
	const groups = new Map<string, DayGroup>();
	for (const t of items) {
		const day = localDate(new Date(t.occurredAt));
		const g = groups.get(day) ?? {
			day,
			items: [],
			totalMinor: 0,
			currency: t.homeCurrency,
		};
		g.items.push(t);
		g.totalMinor += t.homeAmountMinor;
		groups.set(day, g);
	}
	return [...groups.values()];
}

function dayLabel(day: string): string {
	const today = appToday();
	if (day === today) return t("Today");
	if (day === addDays(today, -1)) return t("Yesterday");
	return formatDay(day, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

const TABS = [
	{ id: "expenses", label: t("Expenses") },
	{ id: "insights", label: t("Insights") },
] as const;

/** Expenses list or Insights, switched by `?view=` so other screens can link straight to either. */
export function ActivityPage({
	view,
	initialCategory,
}: {
	view: "expenses" | "insights";
	initialCategory?: string;
}) {
	return (
		<div className="space-y-5">
			<PageHeader title={t("Activity")} />
			<nav
				aria-label={t("Activity views")}
				className="grid grid-cols-2 rounded-full bg-surface-2 p-1"
			>
				{TABS.map((t) => (
					<Link
						key={t.id}
						to="/app/activity"
						search={t.id === "insights" ? { view: "insights" } : {}}
						aria-current={view === t.id ? "page" : undefined}
						className={cn(
							"relative z-10 grid min-h-11 place-items-center rounded-full px-3 font-semibold transition-colors",
							view === t.id
								? "text-plum-50 dark:text-plum-900"
								: "text-ink-soft hover:text-ink",
						)}
					>
						{view === t.id && (
							<motion.span
								layoutId="activity-tab"
								className="absolute inset-0 -z-10 rounded-full bg-plum-900 dark:bg-plum-50"
								transition={{ type: "spring", stiffness: 420, damping: 34 }}
							/>
						)}
						{t.label}
					</Link>
				))}
			</nav>
			{view === "insights" ? (
				<InsightsView />
			) : (
				<ExpensesView key={initialCategory} initialCategory={initialCategory} />
			)}
		</div>
	);
}

function ExpensesView({ initialCategory }: { initialCategory?: string }) {
	const [search, setSearch] = useState("");
	const [categoryId, setCategoryId] = useState(initialCategory ?? "");
	const q = useDeferredValue(search.trim());
	const { data: categories = [] } = useQuery(categoriesQuery);
	const categoryMap = useCategoryMap();
	const query = useInfiniteQuery(
		transactionsQuery({
			q: q || undefined,
			categoryId: categoryId || undefined,
		}),
	);
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];
	const total = query.data?.pages[0]?.total ?? items.length;
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
	const nextBatch = Math.min(PAGE_SIZE, Math.max(0, total - items.length));

	const filtering = Boolean(q || categoryId);

	return (
		<div className="space-y-5">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
				<label className="relative block">
					<span className="sr-only">{t("Search shops and notes")}</span>
					<Search
						className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-soft"
						aria-hidden="true"
					/>
					<input
						type="search"
						placeholder={t("Search shops and notes")}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-12 w-full rounded-full border-2 border-line bg-surface pr-4 pl-12 outline-none focus:border-plum-500"
					/>
				</label>
				<select
					aria-label={t("Filter by category")}
					value={categoryId}
					onChange={(e) => setCategoryId(e.target.value)}
					className="h-12 rounded-full border-2 border-line bg-surface px-4 outline-none focus:border-plum-500"
				>
					<option value="">{t("All categories")}</option>
					{categories.map((c) => (
						<option key={c.id} value={c.id}>
							{t(c.name)}
						</option>
					))}
				</select>
			</div>

			{query.isPending ? (
				<div className="space-y-3">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="h-16 animate-pulse rounded-tile bg-surface-2"
						/>
					))}
				</div>
			) : items.length === 0 ? (
				<div className="bg-scales rounded-panel border border-line px-6 py-14 text-center">
					<p className="font-display text-[1.4rem] font-bold">
						{filtering ? t("Nothing matches that") : t("No spending yet")}
					</p>
					<p className="mx-auto mt-1 max-w-[36ch] text-ink-soft">
						{filtering
							? t("Try another word or category.")
							: t("Everything you log shows up here, newest first.")}
					</p>
					{!filtering && (
						<button
							type="button"
							onClick={capture.openType}
							className={buttonClass("coin", "md", "mt-5")}
						>
							{t("Add an expense")}
						</button>
					)}
				</div>
			) : (
				<div className="space-y-5">
					{groupByDay(items).map((g) => (
						<section key={g.day} aria-label={dayLabel(g.day)}>
							<div className="sticky top-0 z-10 -mx-2 flex items-center justify-between bg-bg/90 px-2 py-2 backdrop-blur">
								<h2 className="font-display text-[1.1rem] font-bold">
									{dayLabel(g.day)}
								</h2>
								<span className="num font-semibold text-ink-soft">
									{formatMinor(g.totalMinor, g.currency)}
								</span>
							</div>
							<ul>
								<AnimatePresence initial={false}>
									{g.items.map((t) => (
										<TransactionRow
											key={t.id}
											t={t}
											category={categoryMap.get(t.categoryId)}
										/>
									))}
								</AnimatePresence>
							</ul>
						</section>
					))}
					<div className="flex flex-col items-center gap-3 border-t border-line py-5">
						<p className="num text-[0.9rem] text-ink-soft" aria-live="polite">
							{hasNextPage
								? t("Showing {n} of {total}", { n: items.length, total })
								: t(
										total === 1
											? "That's everything: 1 expense."
											: "That's everything: {total} expenses.",
										{ total },
									)}
						</p>
						{hasNextPage && (
							<button
								type="button"
								onClick={() => void fetchNextPage()}
								disabled={isFetchingNextPage}
								className={buttonClass("ghost", "md", "border-2 border-line")}
							>
								{isFetchingNextPage ? (
									<LoaderCircle
										className="size-5 animate-spin"
										aria-hidden="true"
									/>
								) : (
									<ChevronDown className="size-5" aria-hidden="true" />
								)}
								{isFetchingNextPage
									? t("Loading more")
									: t("Show {n} more", { n: nextBatch || PAGE_SIZE })}
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
