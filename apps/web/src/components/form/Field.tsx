import { Eye, EyeOff } from "lucide-react";
import {
	type InputHTMLAttributes,
	type ReactNode,
	useId,
	useState,
} from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label: string;
	hint?: string;
	error?: string;
	adornment?: ReactNode;
}

const inputClass =
	"h-13 w-full rounded-tile border-2 border-line bg-surface px-4 text-[1.02rem] text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-plum-500 aria-invalid:border-coral";

/** Labelled input with hint and error wired up for screen readers. */
export function Field({
	label,
	hint,
	error,
	adornment,
	className,
	id,
	...input
}: FieldProps) {
	const autoId = useId();
	const inputId = id ?? autoId;
	const describedBy = error
		? `${inputId}-error`
		: hint
			? `${inputId}-hint`
			: undefined;

	return (
		<div className={cn("space-y-1.5", className)}>
			<label htmlFor={inputId} className="block font-semibold">
				{label}
			</label>
			<div className="relative">
				{adornment && (
					<span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-ink-soft">
						{adornment}
					</span>
				)}
				<input
					id={inputId}
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy}
					className={cn(inputClass, adornment ? "pl-14" : undefined)}
					{...input}
				/>
			</div>
			{error ? (
				<p
					id={`${inputId}-error`}
					className="text-[0.9rem] font-medium text-over"
				>
					{error}
				</p>
			) : hint ? (
				<p id={`${inputId}-hint`} className="text-[0.9rem] text-ink-soft">
					{hint}
				</p>
			) : null}
		</div>
	);
}

/** Password input with a show/hide toggle. */
export function PasswordField(props: Omit<FieldProps, "type" | "adornment">) {
	const [visible, setVisible] = useState(false);
	const id = useId();
	return (
		<div className="relative">
			<Field
				{...props}
				id={props.id ?? id}
				type={visible ? "text" : "password"}
				className={cn("[&_input]:pr-14", props.className)}
			/>
			<button
				type="button"
				onClick={() => setVisible((v) => !v)}
				aria-label={visible ? t("Hide password") : t("Show password")}
				aria-controls={props.id ?? id}
				className="absolute top-[2.1rem] right-1.5 grid size-11 place-items-center rounded-full text-ink-soft hover:text-ink"
			>
				{visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
			</button>
		</div>
	);
}
