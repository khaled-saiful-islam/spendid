import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field, PasswordField } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";

type Errors = Partial<Record<"name" | "email" | "password", string>>;

function validate(name: string, email: string, password: string): Errors {
	const errors: Errors = {};
	if (!name.trim()) errors.name = "Tell us what to call you.";
	if (!/^\S+@\S+\.\S+$/.test(email.trim()))
		errors.email = "Enter an email like name@example.com.";
	if (password.length < 8) errors.password = "Use at least 8 characters.";
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

	return (
		<AuthLayout
			title="Create your account"
			intro="Free, private, and ready in a minute."
			footer={
				<>
					Already have an account?{" "}
					<Link
						to="/signin"
						className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
					>
						Sign in
					</Link>
				</>
			}
		>
			<form onSubmit={onSubmit} className="space-y-5" noValidate>
				<MaybeAlert tone="error" message={error} />
				<Field
					label="Your name"
					name="name"
					autoComplete="name"
					value={name}
					error={errors.name}
					onChange={(e) => setName(e.target.value)}
				/>
				<Field
					label="Email"
					name="email"
					type="email"
					autoComplete="email"
					inputMode="email"
					value={email}
					error={errors.email}
					hint="We'll send a link to confirm it's you."
					onChange={(e) => setEmail(e.target.value)}
				/>
				<PasswordField
					label="Password"
					name="password"
					autoComplete="new-password"
					value={password}
					error={errors.password}
					hint="At least 8 characters. A short sentence works well."
					onChange={(e) => setPassword(e.target.value)}
				/>
				<SubmitButton pending={pending} pendingLabel="Creating your account…">
					Create account
				</SubmitButton>
				<p className="text-center text-[0.88rem] text-ink-soft">
					Your data is never sold. You can export or delete it any time.
				</p>
			</form>
		</AuthLayout>
	);
}
