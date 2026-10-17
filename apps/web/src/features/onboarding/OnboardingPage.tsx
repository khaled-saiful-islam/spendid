import {
	type BudgetMethod,
	type Locale,
	type Me,
	minorDigits,
	type Summary,
	toMinor,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { t } from "@/i18n";
import { ApiError } from "@/lib/http";
import { meQuery, saveProfile } from "@/lib/me";
import { summaryQuery } from "@/lib/money-api";
import { LivePreview } from "./LivePreview";
import { Reveal } from "./Reveal";
import { IncomeStep, MethodStep, PlaceStep } from "./Steps";

const STEPS = [
	{
		title: t("Let's set you up"),
		intro: t("Three quick questions and your daily number is ready."),
	},
	{
		title: t("What comes in each month?"),
		intro: t("Your income is the starting point for a safe daily amount."),
	},
	{
		title: t("How do you like to budget?"),
		intro: t("Pick the style that feels natural. You can switch later."),
	},
];

function initialIncome(me: Me): string {
	const minor = me.profile.monthlyIncomeMinor;
	return minor === null
		? ""
		: String(minor / 10 ** minorDigits(me.profile.homeCurrency));
}

export function OnboardingPage({ me }: { me: Me }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [step, setStep] = useState(0);
	const [name, setName] = useState(me.user.name);
	const [homeCurrency, setCurrency] = useState(me.profile.homeCurrency);
	const [locale, setLocale] = useState<Locale>(me.profile.locale);
	const [income, setIncome] = useState(initialIncome(me));
	const [method, setMethod] = useState<BudgetMethod>(me.profile.budgetMethod);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [pending, setPending] = useState(false);
	const [revealed, setRevealed] = useState<Summary | null>(null);

	const incomeNumber =
		income.trim() === "" ? null : Number(income.replace(",", "."));

	function next(e: FormEvent) {
		e.preventDefault();
		if (step === 0 && !name.trim())
			return setErrors({ name: t("Tell us what to call you.") });
		if (
			step === 1 &&
			incomeNumber !== null &&
			(Number.isNaN(incomeNumber) || incomeNumber < 0)
		)
			return setErrors({
				monthlyIncomeMinor: t("Enter an amount like 4500 or 4500.50."),
			});
		setErrors({});
		if (step < STEPS.length - 1) return setStep(step + 1);
		void finish();
	}

	async function finish() {
		setPending(true);
		try {
			const saved = await saveProfile({
				name: name.trim(),
				homeCurrency,
				locale,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				monthlyIncomeMinor:
					incomeNumber === null ? null : toMinor(incomeNumber, homeCurrency),
				budgetMethod: method,
			});
			queryClient.setQueryData(meQuery.queryKey, saved);
			// Show today's real number before going in; the app opens on "Let's go".
			setRevealed(
				await queryClient.fetchQuery({ ...summaryQuery, staleTime: 0 }),
			);
		} catch (error) {
			setPending(false);
			setErrors(
				error instanceof ApiError
					? { ...error.fields, _: error.message }
					: { _: t("Couldn't save. Try again.") },
			);
		}
	}

	const current = STEPS[step] ?? { title: "", intro: "" };
	const incomeMinor =
		incomeNumber !== null && !Number.isNaN(incomeNumber) && incomeNumber > 0
			? toMinor(incomeNumber, homeCurrency)
			: null;

	if (revealed)
		return (
			<Reveal
				summary={revealed}
				name={name}
				onGo={() => void navigate({ to: "/app" })}
			/>
		);

	return (
		<div className="bg-scales relative min-h-dvh overflow-hidden bg-plum-950 text-plum-50">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-40 right-[-20%] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_178_36/0.22),transparent)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute bottom-[-30%] left-[-25%] h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgb(122_79_196/0.35),transparent)]"
			/>
			<div className="relative mx-auto grid min-h-dvh max-w-6xl gap-6 px-4 pt-5 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-12 lg:py-10">
				<div className="flex items-center justify-between lg:col-span-2">
					<Logo className="text-plum-50" />
					<span className="text-[0.95rem] font-medium text-plum-200">
						{t("Step {n} of {total}", { n: step + 1, total: STEPS.length })}
					</span>
				</div>

				<div className="hidden lg:order-2 lg:block">
					<LivePreview
						name={name}
						currency={homeCurrency}
						incomeMinor={incomeMinor}
						method={method}
						step={step}
					/>
				</div>

				<div className="flex flex-col rounded-panel bg-surface p-5 text-ink shadow-lift sm:p-8 lg:order-1 lg:min-h-[36rem]">
					<div className="grid grid-cols-3 gap-2" aria-hidden="true">
						{STEPS.map((st, i) => (
							<span
								key={st.title}
								className="h-1.5 overflow-hidden rounded-full bg-line"
							>
								<motion.span
									className="block h-full bg-marigold"
									initial={false}
									animate={{ width: i <= step ? "100%" : "0%" }}
								/>
							</span>
						))}
					</div>

					<form
						onSubmit={next}
						className="mt-8 flex flex-1 flex-col"
						noValidate
					>
						<AnimatePresence mode="wait" initial={false}>
							<motion.div
								key={step}
								initial={{ opacity: 0, x: 40 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -40 }}
								transition={{ type: "spring", stiffness: 300, damping: 30 }}
							>
								<h1 className="text-[clamp(2rem,6vw,2.6rem)] leading-tight font-extrabold">
									{current.title}
								</h1>
								<p className="mt-2 mb-8 text-[1.05rem] text-ink-soft">
									{current.intro}
								</p>
								{step === 0 && (
									<PlaceStep
										name={name}
										currency={homeCurrency}
										locale={locale}
										nameError={errors.name}
										currencyLocked={me.currencyLocked}
										onChange={(p) => {
											if (p.name !== undefined) setName(p.name);
											if (p.homeCurrency) setCurrency(p.homeCurrency);
											if (p.locale) setLocale(p.locale);
										}}
									/>
								)}
								{step === 1 && (
									<IncomeStep
										currency={homeCurrency}
										value={income}
										onChange={setIncome}
										error={errors.monthlyIncomeMinor}
									/>
								)}
								{step === 2 && (
									<MethodStep value={method} onChange={setMethod} />
								)}
								{step > 0 && (
									<div className="mt-6 rounded-panel bg-plum-900 lg:hidden">
										<LivePreview
											name={name}
											currency={homeCurrency}
											incomeMinor={incomeMinor}
											method={method}
											step={step}
										/>
									</div>
								)}
							</motion.div>
						</AnimatePresence>

						<div className="mt-auto space-y-3 pt-10">
							<MaybeAlert tone="error" message={errors._} />
							<SubmitButton pending={pending} pendingLabel={t("Saving…")}>
								{step < STEPS.length - 1
									? t("Continue")
									: t("Show my safe-to-spend")}
							</SubmitButton>
							{step === 1 && (
								<button
									type="button"
									onClick={() => {
										setIncome("");
										setStep(2);
									}}
									className="h-11 w-full font-medium text-ink-soft hover:text-ink"
								>
									{t("Skip for now")}
								</button>
							)}
							{step > 0 && (
								<button
									type="button"
									onClick={() => setStep(step - 1)}
									className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-ink-soft hover:text-ink"
								>
									<ArrowLeft className="size-4" aria-hidden="true" />{" "}
									{t("Back")}
								</button>
							)}
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
