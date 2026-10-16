import { EMAIL_GROUP_INFO, type EmailGroup } from "@spendid/shared";
import { Link } from "@tanstack/react-router";
import { MailX } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { buttonClass } from "@/components/ui/Button";
import { t as tr } from "@/i18n";
import { ApiError, api } from "@/lib/http";
import { AuthLayout } from "./AuthLayout";

/** From an email footer: switch off one kind of email, no sign-in needed. */
export function UnsubscribePage({
	u,
	g,
	t,
}: {
	u?: string;
	g?: string;
	t?: string;
}) {
	const info =
		g && g in EMAIL_GROUP_INFO
			? {
					label: tr(EMAIL_GROUP_INFO[g as EmailGroup].label),
					about: tr(EMAIL_GROUP_INFO[g as EmailGroup].about),
				}
			: null;
	const [state, setState] = useState<"ask" | "busy" | "done">("ask");
	const [error, setError] = useState<string | null>(null);

	async function turnOff() {
		setState("busy");
		setError(null);
		try {
			await api("/api/email/unsubscribe", {
				method: "POST",
				body: JSON.stringify({ u, g, t }),
			});
			setState("done");
		} catch (err) {
			setState("ask");
			setError(
				err instanceof ApiError
					? err.message
					: tr("That didn't work. Try again."),
			);
		}
	}

	if (!u || !t || !info)
		return (
			<AuthLayout
				title={tr("This link isn't complete")}
				intro={tr("Choose which emails you get in Spendid's settings instead.")}
			>
				<Link to="/app/me" className={buttonClass("ink", "lg", "w-full")}>
					{tr("Open settings")}
				</Link>
			</AuthLayout>
		);

	return (
		<AuthLayout
			title={
				state === "done"
					? tr("You're unsubscribed")
					: `Stop "${info.label}" emails?`
			}
			intro={
				state === "done"
					? tr("We won't send {label} emails any more.", {
							label: tr(info.label).toLowerCase(),
						})
					: info.about
			}
		>
			<motion.div
				initial={{ scale: 0.6, rotate: -8 }}
				animate={{ scale: 1, rotate: 0 }}
				transition={{ type: "spring", stiffness: 260, damping: 14 }}
				className="mx-auto grid size-24 place-items-center rounded-full bg-marigold text-plum-900 shadow-coin"
			>
				<MailX className="size-11" aria-hidden="true" />
			</motion.div>
			<div className="mt-8 space-y-3">
				<MaybeAlert tone="error" message={error} />
				{state === "done" ? (
					<p className="text-center text-ink-soft">
						Changed your mind? Turn it back on any time in{" "}
						<Link
							to="/app/me"
							className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4"
						>
							{tr("settings")}
						</Link>
						.
					</p>
				) : (
					<button
						type="button"
						disabled={state === "busy"}
						onClick={() => void turnOff()}
						className={buttonClass("coin", "lg", "w-full")}
					>
						{state === "busy"
							? tr("Turning off…")
							: tr("Turn these emails off")}
					</button>
				)}
			</div>
		</AuthLayout>
	);
}
