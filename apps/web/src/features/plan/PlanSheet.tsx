import {
	type BudgetMethod,
	daysInclusive,
	formatMinor,
	minorDigits,
	type PeriodKind,
	type PlanSetup,
	type PlanSetupInput,
	parseAmount,
	toMinor,
} from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useId, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { summaryQuery } from "@/lib/money-api";
import {
	planSetupApi,
	planSetupQuery,
	refreshPlan,
} from "@/lib/plan-setup-api";
import { MethodStep } from "../onboarding/Steps";

interface Draft {
	period: PeriodKind;
	startsOn: string;
	endsOn: string;
	income: string;
	method: BudgetMethod | null;
}

type Built = { input: PlanSetupInput } | { field: string; message: string };

function draftFrom(setup: PlanSetup, currency: string): Draft {
	return {
		period: setup.period,
		startsOn: setup.cycle?.startsOn ?? "",
		endsOn: setup.cycle?.endsOn ?? "",
		income:
			setup.incomeMinor === null
				? ""
				: String(setup.incomeMinor / 10 ** minorDigits(currency)),
		method: setup.method,
	};
}

/** What the sheet would save, or the first problem to show (the server checks again). */
function build(d: Draft, currency: string): Built {
	const major = parseAmount(d.income);
	if (d.income.trim() === "" || Number.isNaN(major))
		return { field: "incomeMinor", message: t("Add your salary.") };
	if (d.period === "cycle" && (!d.startsOn || !d.endsOn))
		return {
			field: "cycle.startsOn",
			message: t("Pick the start and end dates."),
		};
	return {
		input: {
			period: d.period,
			cycle:
				d.period === "cycle"
					? { startsOn: d.startsOn, endsOn: d.endsOn }
					: null,
			incomeMinor: toMinor(major, currency),
			method: d.method,
		},
	};
}

/** Period, cycle dates, salary and plan style on one sheet, saved with one tap. */
export function PlanSheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { data: setup } = useQuery({ ...planSetupQuery, enabled: open });
	const { data: summary } = useQuery(summaryQuery);
	const currency = summary?.homeCurrency ?? "MYR";
	const [draft, setDraft] = useState<Draft | null>(null);
	const [fields, setFields] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [daily, setDaily] = useState<number | null>(null);
	const periodId = useId();

	// Start from the saved plan each time the sheet opens.
	useEffect(() => {
		if (!open || !setup) return;
		setDraft(draftFrom(setup, currency));
		setFields({});
		setError(null);
	}, [open, setup, currency]);

	// The daily amount, worked out by the server with the same maths as Home.
	useEffect(() => {
		if (!draft) return;
		const built = build(draft, currency);
		if (!("input" in built)) {
			setDaily(null);
			return;
		}
		const timer = setTimeout(() => {
			planSetupApi
				.preview(built.input)
				.then((p) =>
					setDaily(p.status === "no-income" ? null : p.dailyAllowanceMinor),
				)
				.catch(() => setDaily(null));
		}, 300);
		return () => clearTimeout(timer);
	}, [draft, currency]);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!draft) return;
		const built = build(draft, currency);
		if (!("input" in built)) {
			setFields({ [built.field]: built.message });
			return;
		}
		setPending(true);
		setError(null);
		setFields({});
		try {
			await planSetupApi.save(built.input);
			const needsTransfers =
				built.input.method === "pay_yourself_first" &&
				(summary?.transfers.length ?? 0) === 0;
			await refreshPlan(queryClient);
			toast(t("Plan saved."));
			onClose();
			if (needsTransfers) void navigate({ to: "/app/plan", hash: "transfers" });
		} catch (err) {
			if (err instanceof ApiError && Object.keys(err.fields).length > 0)
				setFields(
					Object.fromEntries(
						Object.entries(err.fields).map(([k, v]) => [k, t(v)]),
					),
				);
			else
				setError(
					err instanceof ApiError
						? err.message
						: t("Couldn't save. Try again."),
				);
		}
		setPending(false);
	}

	const set = (patch: Partial<Draft>) =>
		setDraft((d) => (d ? { ...d, ...patch } : d));
	const length =
		draft?.startsOn && draft.endsOn && draft.endsOn >= draft.startsOn
			? daysInclusive(draft.startsOn, draft.endsOn)
			: null;

	return (
		<Sheet open={open} onClose={onClose} title={t("Your plan")}>
			{!draft ? (
				<p className="text-ink-soft">{t("Loading…")}</p>
			) : (
				<form onSubmit={onSubmit} noValidate className="space-y-5">
					<div className="space-y-2">
						<p id={periodId} className="font-semibold">
							{t("Budget period")}
						</p>
						<div
							role="radiogroup"
							aria-labelledby={periodId}
							className="grid grid-cols-2 gap-2"
						>
							{(["month", "cycle"] as const).map((kind) => (
								<button
									key={kind}
									type="button"
									role="radio"
									aria-checked={draft.period === kind}
									onClick={() => set({ period: kind })}
									className={cn(
										"min-h-11 rounded-full border-2 px-3 py-2 leading-snug font-semibold",
										draft.period === kind
											? "border-plum-500 bg-plum-500/10"
											: "border-line",
									)}
								>
									{kind === "month" ? t("Calendar month") : t("My own dates")}
								</button>
							))}
						</div>
					</div>

					{draft.period === "cycle" && (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<Field
								label={t("Starts")}
								type="date"
								value={draft.startsOn}
								max={setup?.today}
								onChange={(e) => set({ startsOn: e.target.value })}
								error={fields["cycle.startsOn"]}
							/>
							<Field
								label={t("Ends")}
								type="date"
								value={draft.endsOn}
								min={setup?.today}
								onChange={(e) => set({ endsOn: e.target.value })}
								error={fields["cycle.endsOn"]}
								hint={length ? t("{n} days", { n: length }) : undefined}
							/>
						</div>
					)}

					<Field
						label={
							draft.period === "cycle"
								? t("Salary this cycle")
								: t("Monthly income")
						}
						inputMode="decimal"
						value={draft.income}
						onChange={(e) => set({ income: e.target.value })}
						error={fields.incomeMinor}
					/>

					<div className="space-y-2">
						<p className="font-semibold">{t("Plan style")}</p>
						<MethodStep
							value={draft.method}
							onChange={(method) => set({ method })}
						/>
					</div>

					<p
						aria-live="polite"
						className="rounded-tile bg-surface-2 px-4 py-3 text-[0.95rem]"
					>
						{daily === null
							? t("Your daily amount shows here.")
							: t("About {amount} a day to spend.", {
									amount: formatMinor(daily, currency),
								})}
					</p>

					<MaybeAlert tone="error" message={error} />
					<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
						{t("Save")}
					</SubmitButton>
				</form>
			)}
		</Sheet>
	);
}

/** One sheet for every "Change" and "Pick a plan" button. */
export function usePlanSheet() {
	const [open, setOpen] = useState(false);
	return {
		open: () => setOpen(true),
		sheet: <PlanSheet open={open} onClose={() => setOpen(false)} />,
	};
}
