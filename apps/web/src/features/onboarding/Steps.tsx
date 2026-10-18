import type { BudgetMethod, Locale } from "@spendid/shared";
import { Check } from "lucide-react";
import { Field } from "@/components/form/Field";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import { currencyOptions, currencySymbol, METHODS } from "./options";

const selectClass =
	"h-13 w-full appearance-none rounded-tile border-2 border-line bg-surface bg-[length:1.1rem] bg-[right_1rem_center] bg-no-repeat px-4 pr-11 text-[1.02rem] outline-none focus:border-plum-500 disabled:opacity-60";
const chevron = {
	backgroundImage:
		"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237a4fc4' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

interface PlaceStepProps {
	name: string;
	currency: string;
	locale: Locale;
	onChange: (patch: {
		name?: string;
		homeCurrency?: string;
		locale?: Locale;
	}) => void;
	nameError?: string;
	/** Spending exists, so the currency is fixed. */
	currencyLocked?: boolean;
}

export function PlaceStep({
	name,
	currency,
	locale,
	onChange,
	nameError,
	currencyLocked = false,
}: PlaceStepProps) {
	const { popular, rest } = currencyOptions(locale === "ms" ? "ms-MY" : "en");
	return (
		<div className="space-y-5">
			<Field
				label={t("What should we call you?")}
				value={name}
				error={nameError}
				autoComplete="given-name"
				onChange={(e) => onChange({ name: e.target.value })}
			/>
			<div className="space-y-1.5">
				<label htmlFor="currency" className="block font-semibold">
					{t("Your home currency")}
				</label>
				<select
					id="currency"
					className={selectClass}
					style={chevron}
					value={currency}
					disabled={currencyLocked}
					aria-describedby="currency-help"
					onChange={(e) => onChange({ homeCurrency: e.target.value })}
				>
					<optgroup label={t("Popular")}>
						{popular.map((c) => (
							<option key={c.code} value={c.code}>
								{c.label}
							</option>
						))}
					</optgroup>
					<optgroup label={t("All currencies")}>
						{rest.map((c) => (
							<option key={c.code} value={c.code}>
								{c.label}
							</option>
						))}
					</optgroup>
				</select>
				<p id="currency-help" className="text-[0.9rem] text-ink-soft">
					{currencyLocked
						? t(
								"This stays the same once you've logged spending, so past totals don't mix currencies.",
							)
						: t("Spending abroad is converted to this automatically.")}
				</p>
			</div>
			<fieldset className="space-y-2">
				<legend className="mb-1.5 font-semibold">{t("Language")}</legend>
				<div className="grid grid-cols-2 gap-2">
					{(
						[
							["en", "English"],
							["ms", "Bahasa Melayu"],
						] as const
					).map(([value, label]) => (
						<label
							key={value}
							className={cn(
								"flex h-13 cursor-pointer items-center justify-center rounded-tile border-2 font-medium transition-colors has-focus-visible:outline-3 has-focus-visible:outline-marigold",
								locale === value
									? "border-plum-500 bg-plum-500/10"
									: "border-line",
							)}
						>
							<input
								type="radio"
								name="locale"
								value={value}
								checked={locale === value}
								onChange={() => onChange({ locale: value })}
								className="sr-only"
							/>
							{label}
						</label>
					))}
				</div>
				<p className="text-[0.9rem] text-ink-soft">
					{t("You can switch any time in Settings.")}
				</p>
			</fieldset>
		</div>
	);
}

interface IncomeStepProps {
	currency: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
}

export function IncomeStep({
	currency,
	value,
	onChange,
	error,
}: IncomeStepProps) {
	return (
		<div className="space-y-4">
			<Field
				label={t("Take-home pay each month")}
				inputMode="decimal"
				placeholder="0.00"
				adornment={currencySymbol(currency)}
				value={value}
				error={error}
				hint={t(
					"After tax. A rough number is fine, or skip it. Change it any time in Profile, under Money settings.",
				)}
				onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
				className="[&_input]:num [&_input]:text-[1.4rem] [&_input]:font-bold"
			/>
			<p className="rounded-tile bg-surface-2 px-4 py-3 text-[0.95rem] text-ink-soft">
				{t("Spendid uses this to work out your")}{" "}
				<strong className="text-ink">{t("safe to spend today")}</strong>{" "}
				{t("number. It stays private to you.")}
			</p>
		</div>
	);
}

interface MethodStepProps {
	value: BudgetMethod;
	onChange: (value: BudgetMethod) => void;
}

export function MethodStep({ value, onChange }: MethodStepProps) {
	return (
		<fieldset className="space-y-3">
			<legend className="sr-only">{t("Budget style")}</legend>
			{METHODS.map((m) => {
				const selected = m.id === value;
				return (
					<label
						key={m.id}
						className={cn(
							"block w-full cursor-pointer rounded-panel border-2 p-4 text-left transition-[border-color,background-color,transform] active:scale-[0.99] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-marigold",
							selected
								? "border-plum-500 bg-plum-500/8"
								: "border-line bg-surface hover:border-plum-300",
						)}
					>
						<input
							type="radio"
							name="budget-method"
							value={m.id}
							checked={selected}
							onChange={() => onChange(m.id)}
							className="sr-only"
						/>
						<span className="flex items-start justify-between gap-3">
							<span className="font-display text-[1.3rem] font-bold">
								{m.title}
							</span>
							<span
								className={cn(
									"grid size-7 shrink-0 place-items-center rounded-full border-2",
									selected
										? "border-plum-500 bg-plum-500 text-white dark:text-plum-950"
										: "border-line",
								)}
								aria-hidden="true"
							>
								{selected && <Check className="size-4" strokeWidth={3} />}
							</span>
						</span>
						<span className="mt-1 block text-[0.95rem] text-ink-soft">
							{m.body}
						</span>
						<span
							className="mt-3 flex h-3 overflow-hidden rounded-full"
							aria-hidden="true"
						>
							{m.bars.map((b) => (
								<span
									key={b.label}
									className={b.color}
									style={{ width: `${b.share}%` }}
								/>
							))}
						</span>
						<span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.8rem] text-ink-soft">
							{m.bars.map((b) => (
								<span
									key={b.label}
									className="inline-flex items-center gap-1.5"
								>
									<span
										className={cn("size-2 rounded-full", b.color)}
										aria-hidden="true"
									/>
									{b.label}
								</span>
							))}
						</span>
					</label>
				);
			})}
		</fieldset>
	);
}
