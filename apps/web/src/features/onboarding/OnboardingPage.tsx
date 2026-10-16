import {
	type BudgetMethod,
	type Locale,
	type Me,
	minorDigits,
	toMinor,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { ApiError } from "@/lib/http";
import { meQuery, saveProfile } from "@/lib/me";
import { IncomeStep, MethodStep, PlaceStep } from "./Steps";

const STEPS = [
	{
		title: "Let's set you up",
		intro: "Three quick questions and your daily number is ready.",
	},
	{
		title: "What comes in each month?",
		intro: "Your income is the starting point for a safe daily amount.",
	},
	{
		title: "How do you like to budget?",
		intro: "Pick the style that feels natural. You can switch later.",
	},
];

function initialIncome(me: Me): string {
	const minor = me.profile.monthlyIncomeMinor;
	return minor === null
		? ""
		: String(minor / 10 ** minorDigits(me.profile.homeCurrency));
}

function celebrate() {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	void confetti({
		particleCount: 120,
		spread: 80,
		origin: { y: 0.7 },
		colors: ["#FFB224", "#12B886", "#7A4FC4", "#FF5C7A"],
	});
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

	const incomeNumber =
		income.trim() === "" ? null : Number(income.replace(",", "."));

	function next(e: FormEvent) {
		e.preventDefault();
		if (step === 0 && !name.trim())
			return setErrors({ name: "Tell us what to call you." });
		if (
			step === 1 &&
			incomeNumber !== null &&
			(Number.isNaN(incomeNumber) || incomeNumber < 0)
		)
			return setErrors({
				monthlyIncomeMinor: "Enter an amount like 4500 or 4500.50.",
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
			celebrate();
			setTimeout(() => void navigate({ to: "/app" }), 900);
		} catch (error) {
			setPending(false);
			setErrors(
				error instanceof ApiError
					? { ...error.fields, _: error.message }
					: { _: "Couldn't save. Try again." },
			);
		}
	}

	const current = STEPS[step] ?? { title: "", intro: "" };
	return (
		<div className="bg-scales min-h-dvh">
			<div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-5 pb-8 sm:px-6">
				<div className="flex items-center justify-between">
					<Logo />
					<span className="text-[0.95rem] font-medium text-ink-soft">
						Step {step + 1} of {STEPS.length}
					</span>
				</div>
				<div className="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
					{STEPS.map((s, i) => (
						<span
							key={s.title}
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

				<form onSubmit={next} className="mt-10 flex flex-1 flex-col" noValidate>
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={step}
							initial={{ opacity: 0, x: 40 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -40 }}
							transition={{ type: "spring", stiffness: 300, damping: 30 }}
						>
							<h1 className="text-[clamp(2rem,7vw,2.6rem)] font-extrabold">
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
							{step === 2 && <MethodStep value={method} onChange={setMethod} />}
						</motion.div>
					</AnimatePresence>

					<div className="mt-auto space-y-3 pt-10">
						<MaybeAlert tone="error" message={errors._} />
						<SubmitButton pending={pending} pendingLabel="Saving…">
							{step < STEPS.length - 1 ? "Continue" : "Show my safe-to-spend"}
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
								Skip for now
							</button>
						)}
						{step > 0 && (
							<button
								type="button"
								onClick={() => setStep(step - 1)}
								className="inline-flex h-11 w-full items-center justify-center gap-2 font-medium text-ink-soft hover:text-ink"
							>
								<ArrowLeft className="size-4" aria-hidden="true" /> Back
							</button>
						)}
					</div>
				</form>
			</div>
		</div>
	);
}
