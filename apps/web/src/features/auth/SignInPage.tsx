import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fingerprint } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field, PasswordField } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { homeFor, meQuery } from "@/lib/me";
import { AuthLayout } from "./AuthLayout";

interface SignInPageProps {
	notice?: string;
}

export function SignInPage({ notice }: SignInPageProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<{ message: string; code?: string } | null>(
		null,
	);
	const [pending, setPending] = useState(false);
	const [resent, setResent] = useState(false);

	async function goHome() {
		await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
		const me = await queryClient.fetchQuery(meQuery);
		await navigate({ to: me ? homeFor(me) : "/signin" });
	}

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		const id = identifier.trim();
		const { error: err } = id.includes("@")
			? await authClient.signIn.email({ email: id, password })
			: await authClient.signIn.username({ username: id, password });
		setPending(false);
		if (err) {
			setError({ message: authErrorMessage(err), code: err.code });
			return;
		}
		await goHome();
	}

	async function signInWithPasskey() {
		setError(null);
		const result = await authClient.signIn.passkey();
		if (result?.error) {
			setError({
				message:
					"Passkey sign-in didn't finish. Try again or use your password.",
			});
			return;
		}
		await goHome();
	}

	async function resendVerification() {
		await authClient.sendVerificationEmail({
			email: identifier.trim(),
			callbackURL: "/onboarding",
		});
		setResent(true);
	}

	const canResend =
		error?.code === "EMAIL_NOT_VERIFIED" && identifier.includes("@") && !resent;

	return (
		<AuthLayout
			title="Welcome back"
			intro="Sign in to see what's safe to spend today."
			footer={
				<>
					New to Spendid?{" "}
					<Link
						to="/signup"
						className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
					>
						Create an account
					</Link>
				</>
			}
		>
			<form onSubmit={onSubmit} className="space-y-5" noValidate>
				<MaybeAlert tone="success" message={notice} />
				<MaybeAlert tone="error" message={error?.message}>
					{canResend && (
						<button
							type="button"
							onClick={resendVerification}
							className="mt-1 block font-semibold underline"
						>
							Send the link again
						</button>
					)}
				</MaybeAlert>
				<MaybeAlert
					tone="success"
					message={resent ? "New link sent. Check your inbox." : null}
				/>
				<Field
					label="Email or username"
					name="identifier"
					autoComplete="username webauthn"
					required
					value={identifier}
					onChange={(e) => setIdentifier(e.target.value)}
				/>
				<div className="space-y-2">
					<PasswordField
						label="Password"
						name="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<Link
						to="/forgot"
						className="inline-block py-1 text-[0.95rem] font-medium text-ink-soft hover:text-ink"
					>
						Forgot your password?
					</Link>
				</div>
				<SubmitButton pending={pending} pendingLabel="Signing in…">
					Sign in
				</SubmitButton>
			</form>

			<div
				className="my-6 flex items-center gap-3 text-[0.9rem] text-ink-soft"
				aria-hidden="true"
			>
				<span className="h-px flex-1 bg-line" />
				or
				<span className="h-px flex-1 bg-line" />
			</div>
			<button
				type="button"
				onClick={signInWithPasskey}
				className={buttonClass("ghost", "lg", "w-full border-2 border-line")}
			>
				<Fingerprint className="size-5" aria-hidden="true" />
				Sign in with a passkey
			</button>
		</AuthLayout>
	);
}
