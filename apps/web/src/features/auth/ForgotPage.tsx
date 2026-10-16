import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { t } from "@/i18n";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";

export function ForgotPage() {
	const [email, setEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setPending(true);
		setError(null);
		const { error: err } = await authClient.requestPasswordReset({
			email: email.trim(),
			redirectTo: `${window.location.origin}/reset`,
		});
		setPending(false);
		// Same message whether or not the account exists, so emails can't be probed.
		if (err && err.status === 429) setError(authErrorMessage(err));
		else setDone(true);
	}

	return (
		<AuthLayout
			title={t("Forgot your password?")}
			intro={t("Enter your email and we'll send a link to choose a new one.")}
			footer={
				<Link
					to="/signin"
					className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
				>
					{t("Back to sign in")}
				</Link>
			}
		>
			{done ? (
				<MaybeAlert
					tone="success"
					message={t(
						"If {email} has a Spendid account, a reset link is on its way. It works for 1 hour.",
						{ email: email.trim() },
					)}
				/>
			) : (
				<form onSubmit={onSubmit} className="space-y-5">
					<MaybeAlert tone="error" message={error} />
					<Field
						label={t("Email")}
						type="email"
						autoComplete="email"
						inputMode="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<SubmitButton pending={pending} pendingLabel={t("Sending…")}>
						{t("Send reset link")}
					</SubmitButton>
				</form>
			)}
		</AuthLayout>
	);
}
