import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { PasswordField } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";

interface ResetPageProps {
	token?: string;
	linkError?: string;
}

export function ResetPage({ token, linkError }: ResetPageProps) {
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(
		linkError || !token ? authErrorMessage({ code: "INVALID_TOKEN" }) : null,
	);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (password.length < 8) return setError("Use at least 8 characters.");
		if (password !== confirm) return setError("The two passwords don't match.");
		if (!token) return;
		setPending(true);
		setError(null);
		const { error: err } = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setPending(false);
		if (err) return setError(authErrorMessage(err));
		await navigate({
			to: "/signin",
			search: { notice: "Password changed. Sign in with your new one." },
		});
	}

	const broken = Boolean(linkError || !token);

	return (
		<AuthLayout
			title="Choose a new password"
			intro="You'll be signed out on your other devices, to keep things safe."
			footer={
				broken ? (
					<Link
						to="/forgot"
						className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
					>
						Ask for a new link
					</Link>
				) : undefined
			}
		>
			<form onSubmit={onSubmit} className="space-y-5" noValidate>
				<MaybeAlert tone="error" message={error} />
				{!broken && (
					<>
						<PasswordField
							label="New password"
							autoComplete="new-password"
							hint="At least 8 characters."
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<PasswordField
							label="Type it again"
							autoComplete="new-password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
						/>
						<SubmitButton pending={pending} pendingLabel="Saving…">
							Save new password
						</SubmitButton>
					</>
				)}
			</form>
		</AuthLayout>
	);
}
