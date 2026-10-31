import type { PeriodKind } from "@spendid/shared";
import { dateLocale, t } from "@/i18n";

/**
 * "29 Oct → 28 Nov"; the years show when either end isn't in `today`'s year. Day first, as
 * Malaysia writes dates.
 */
export function cycleDates(start: string, end: string, today: string): string {
	const year = today.slice(0, 4);
	const sameYear = start.slice(0, 4) === year && end.slice(0, 4) === year;
	const fmt = (day: string) =>
		new Date(`${day}T12:00:00Z`).toLocaleDateString(dateLocale() ?? "en-GB", {
			day: "numeric",
			month: "short",
			...(sameYear ? {} : { year: "numeric" }),
			timeZone: "UTC",
		});
	return `${fmt(start)} → ${fmt(end)}`;
}

/** The words that change when the plan runs by cycle instead of by month. */
export function periodWords(kind: PeriodKind) {
	return kind === "cycle"
		? {
				income: t("Salary this cycle"),
				left: t("Left this cycle"),
				over: t("Over this cycle"),
				limit: t("Limit per cycle"),
				each: t("each cycle"),
				goalShare: (amount: string, date: string) =>
					t("{amount} a cycle to make it by {date}.", { amount, date }),
			}
		: {
				income: t("Monthly income"),
				left: t("Left this month"),
				over: t("Over this month"),
				limit: t("Monthly limit"),
				each: t("each month"),
				goalShare: (amount: string, date: string) =>
					t("{amount} a month to make it by {date}.", { amount, date }),
			};
}
