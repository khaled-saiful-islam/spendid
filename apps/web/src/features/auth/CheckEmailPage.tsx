import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { buttonClass } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";

export function CheckEmailPage({ email }: { email?: string }) {
	const [sent, setSent] = useState(false);

	async function resend() {
		if (!email) return;
		await authClient.sendVerificationEmail({
			email,
			callbackURL: "/onboarding",
		});
		setSent(true);
	}

	return (
		<AuthLayout
			title="Check your inbox"
			intro={
				<>
					We sent a confirmation link to{" "}
					<strong className="text-ink">{email ?? "your email"}</strong>. Open it
					on this device to finish setting up.
				</>
			}
			footer={
				<Link
					to="/signin"
					className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
				>
					Back to sign in
				</Link>
			}
		>
			<motion.div
				initial={{ scale: 0.6, rotate: -8 }}
				animate={{ scale: 1, rotate: 0 }}
				transition={{ type: "spring", stiffness: 260, damping: 14 }}
				className="mx-auto grid size-24 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin"
			>
				<MailCheck className="size-11" aria-hidden="true" />
			</motion.div>
			<div className="mt-8 space-y-4">
				<MaybeAlert
					tone="success"
					message={sent ? "Sent again. It can take a minute to arrive." : null}
				/>
				{email && !sent && (
					<button
						type="button"
						onClick={resend}
						className={buttonClass(
							"ghost",
							"lg",
							"w-full border-2 border-line",
						)}
					>
						Send the link again
					</button>
				)}
				{import.meta.env.DEV && (
					<a
						href="http://localhost:8604"
						target="_blank"
						rel="noreferrer"
						className={buttonClass("ink", "lg", "w-full")}
					>
						Open the dev inbox (Mailpit)
					</a>
				)}
			</div>
		</AuthLayout>
	);
}
