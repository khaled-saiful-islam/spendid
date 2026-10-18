import { Link, useNavigate } from "@tanstack/react-router";
import { Lock, Mail, UserRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field, PasswordField } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { t } from "@/i18n";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { AuthLayout } from "./AuthLayout";
import { passwordStrength } from "./password-strength";

type Errors = Partial<Record<"name" | "email" | "password", string>>;

function validate(name: string, email: string, password: string): Errors {
	const errors: Errors = {};
	if (!name.trim()) errors.name = t("Tell us what to call you.");
	if (!/^\S+@\S+\.\S+$/.test(email.trim()))
		errors.email = t("Enter an email like name@example.com.");
	if (password.length < 8) errors.password = t("Use at least 8 characters.");
	return errors;
}

export function SignUpPage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errors, setErrors] = useState<Errors>({});
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const reduce = useReducedMotion();

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const found = validate(name, email, password);
		setErrors(found);
		if (Object.keys(found).length > 0) return;

		setPending(true);
		setError(null);
		const { error: err } = await authClient.signUp.email({
			name: name.trim(),
			email: email.trim(),
			password,
			callbackURL: "/onboarding",
		});
		setPending(false);
		if (err) {
			setError(authErrorMessage(err));
			return;
		}
		await navigate({ to: "/check-email", search: { email: email.trim() } });
	}

	const first = name.trim().split(/\s+/)[0] ?? "";
	const done = [
		name.trim().length > 0,
		/^\S+@\S+\.\S+$/.test(email.trim()),
		password.length >= 8,
	];
	const count = done.filter(Boolean).length;
	const ready = count === done.length;
	const strength = passwordStrength(password);

	return (
		<AuthLayout
			greetingName={first || undefined}
			title={
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={first ? "hi" : "create"}
						initial={reduce ? false : { opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.2 }}
						className="block break-words"
					>
						{first
							? t("Hi {name}!", { name: first })
							: t("Create your account")}
					</motion.span>
				</AnimatePresence>
			}
			intro={
				first
					? t("Two more things and your plan is ready.")
					: t("Free, private, and ready in a minute.")
			}
			footer={
				<>
					{t("Already have an account?")}{" "}
					<Link
						to="/signin"
						className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
					>
						{t("Sign in")}
					</Link>
				</>
			}
		>
			<div className="mb-5" aria-hidden="true">
				<div className="flex gap-1.5">
					{done.map((ok, k) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: one fixed slot per field
							key={k}
							className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
						>
							<motion.span
								className="block h-full rounded-full bg-linear-to-r from-marigold to-coral"
								initial={false}
								animate={{ width: ok ? "100%" : "0%" }}
								transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
							/>
						</span>
					))}
				</div>
				<p className="mt-1.5 text-[0.8rem] font-semibold text-ink-soft">
					{ready
						? t("All set. One tap to go.")
						: t("{n} of 3 done", { n: count })}
				</p>
			</div>
			<form onSubmit={onSubmit} className="space-y-5" noValidate>
				<MaybeAlert tone="error" message={error} />
				<Field
					label={t("Your name")}
					name="name"
					autoComplete="name"
					icon={UserRound}
					valid={done[0]}
					value={name}
					error={errors.name}
					onChange={(e) => setName(e.target.value)}
				/>
				<Field
					label={t("Email")}
					name="email"
					type="email"
					autoComplete="email"
					inputMode="email"
					icon={Mail}
					valid={done[1]}
					value={email}
					error={errors.email}
					hint={t("We'll send a link to confirm it's you.")}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<div className="space-y-2">
					<PasswordField
						label={t("Password")}
						name="password"
						autoComplete="new-password"
						icon={Lock}
						valid={done[2]}
						value={password}
						error={errors.password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<PasswordMeter strength={strength} typed={password.length > 0} />
				</div>
				<motion.div
					animate={ready && !reduce ? { scale: [1, 1.03, 1] } : { scale: 1 }}
					transition={{ duration: 0.45 }}
				>
					<SubmitButton
						pending={pending}
						pendingLabel={t("Creating your account…")}
					>
						{ready && first
							? t("Create my account, {name}", { name: first })
							: t("Create account")}
					</SubmitButton>
				</motion.div>
				<p className="text-center text-[0.88rem] text-ink-soft">
					{t("Your data is never sold. You can export or delete it any time.")}
				</p>
			</form>
		</AuthLayout>
	);
}

const METER = [
	{ label: "Too short", tone: "bg-coral", text: "text-over" },
	{ label: "Good", tone: "bg-marigold", text: "text-ink-soft" },
	{ label: "Good", tone: "bg-marigold", text: "text-ink-soft" },
	{ label: "Strong", tone: "bg-jade", text: "text-safe" },
	{ label: "Very strong", tone: "bg-jade", text: "text-safe" },
] as const;

/** Four bars and a plain word; a short sentence is the easy way to fill them. */
function PasswordMeter({
	strength,
	typed,
}: {
	strength: 0 | 1 | 2 | 3 | 4;
	typed: boolean;
}) {
	const level = METER[strength];
	return (
		<div className="space-y-1">
			<div className="flex gap-1" aria-hidden="true">
				{[1, 2, 3, 4].map((n) => (
					<span
						key={n}
						className={cn(
							"h-1.5 flex-1 rounded-full transition-colors duration-300",
							typed && (strength >= n || (strength === 0 && n === 1))
								? level.tone
								: "bg-line",
						)}
					/>
				))}
			</div>
			<p className="flex flex-wrap justify-between gap-x-3 text-[0.85rem]">
				<span
					className={cn("font-semibold", typed ? level.text : "text-ink-soft")}
				>
					{typed ? t(level.label) : t("At least 8 characters")}
				</span>
				<span className="text-ink-soft">
					{t("A short sentence works well.")}
				</span>
			</p>
		</div>
	);
}
