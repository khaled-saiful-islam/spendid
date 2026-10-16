import { LEVEL_INFO, RELATION_LABELS, type ShareLevel } from "@spendid/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { HeartHandshake } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { familyApi, inviteQuery, refreshFamily } from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { meQuery } from "@/lib/me";
import { pendingInvite } from "@/lib/pending-invite";
import { AuthLayout } from "../auth/AuthLayout";
import { LevelPicker } from "./parts";

const STATE_TEXT = {
	expired: t("This invite has ended. Ask them for a new link."),
	used: t(
		"This invite was already used or cancelled. Ask them for a new link.",
	),
	yours: t(
		"This is your own invite. Send the link to the person you're inviting.",
	),
	connected: t("You're already in each other's circle."),
} as const;

/** Opening an invite link: see who's asking and what they share, then say yes. */
export function JoinPage({ token }: { token: string }) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { data: me, isPending: meLoading } = useQuery(meQuery);
	const { data: invite, isPending, error } = useQuery(inviteQuery(token));
	const [level, setLevel] = useState<ShareLevel>("totals");
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState<string | null>(null);
	const member = me && me.user.role !== "admin" && !me.needsOnboarding;

	useEffect(() => {
		if (invite?.state === "ok" && !member && me?.user.role !== "admin")
			pendingInvite.set(token);
		if (invite && invite.state !== "ok") pendingInvite.clear();
	}, [invite, member, me, token]);

	async function join() {
		setPending(true);
		setFailed(null);
		try {
			await familyApi.accept(token, level);
			pendingInvite.clear();
			await refreshFamily(queryClient);
			if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
				void confetti({
					particleCount: 150,
					spread: 90,
					origin: { y: 0.6 },
					colors: ["#FFB224", "#12B886", "#7A4FC4", "#FF5C7A"],
				});
			toast(
				t("You're in {name}'s circle.", { name: invite?.inviterName ?? "" }),
			);
			await navigate({ to: "/app/family" });
		} catch (err) {
			setPending(false);
			setFailed(
				err instanceof ApiError ? err.message : t("Couldn't join. Try again."),
			);
		}
	}

	if (isPending || meLoading)
		return (
			<AuthLayout title={t("Opening your invite…")}>
				<div className="h-40 animate-pulse rounded-panel bg-surface-2" />
			</AuthLayout>
		);
	if (error || !invite)
		return (
			<AuthLayout
				title={t("This link doesn't work")}
				intro={t("It may be incomplete. Ask for a new invite link.")}
			>
				<Link to="/" className={buttonClass("ink", "lg", "w-full")}>
					{t("Go to Spendid")}
				</Link>
			</AuthLayout>
		);

	const relation = t(RELATION_LABELS[invite.relation]).toLowerCase();
	const intro = (
		<>
			<strong className="text-ink">{invite.inviterName}</strong>{" "}
			{t("added you as their {relation} and wants to plan money together.", {
				relation,
			})}
		</>
	);

	return (
		<AuthLayout
			title={t("Join {name}'s circle", { name: invite.inviterName })}
			intro={intro}
		>
			<motion.div
				initial={{ scale: 0.6, rotate: -8 }}
				animate={{ scale: 1, rotate: 0 }}
				transition={{ type: "spring", stiffness: 260, damping: 14 }}
				className="mx-auto grid size-24 place-items-center rounded-full bg-linear-to-br from-marigold to-coral text-plum-900 shadow-coin"
			>
				<HeartHandshake className="size-11" aria-hidden="true" />
			</motion.div>
			<div className="mt-8 space-y-5">
				{invite.state !== "ok" ? (
					<>
						<MaybeAlert tone="info" message={STATE_TEXT[invite.state]} />
						<Link
							to={member ? "/app/family" : "/"}
							className={buttonClass("ink", "lg", "w-full")}
						>
							{member ? t("Open Family") : t("Go to Spendid")}
						</Link>
					</>
				) : (
					<>
						<div className="rounded-tile bg-surface-2 px-4 py-3">
							<p className="font-semibold">
								{t("{name} will share: {level}", {
									name: invite.inviterName,
									level: t(LEVEL_INFO[invite.level].label),
								})}
							</p>
							<p className="text-[0.92rem] text-ink-soft">
								{t(LEVEL_INFO[invite.level].theirs)}
							</p>
						</div>
						{me?.user.role === "admin" ? (
							<MaybeAlert
								tone="info"
								message={t(
									"Admin accounts can't join a family circle. Sign in with a personal account.",
								)}
							/>
						) : !me ? (
							<div className="space-y-3">
								<p className="text-ink-soft">
									{t(
										"Create a free account or sign in, and we'll bring you right back here.",
									)}
								</p>
								<Link
									to="/signup"
									className={buttonClass("coin", "lg", "w-full")}
								>
									{t("Create an account")}
								</Link>
								<Link
									to="/signin"
									className={buttonClass(
										"ghost",
										"lg",
										"w-full border-2 border-line",
									)}
								>
									{t("I already have one")}
								</Link>
							</div>
						) : me.needsOnboarding ? (
							<Link
								to="/onboarding"
								className={buttonClass("coin", "lg", "w-full")}
							>
								{t("Finish setting up first")}
							</Link>
						) : (
							<form
								className="space-y-4"
								onSubmit={(e) => {
									e.preventDefault();
									void join();
								}}
							>
								<LevelPicker
									legend={t("What you'll share with {name}", {
										name: invite.inviterName,
									})}
									name="join-level"
									value={level}
									onChange={setLevel}
								/>
								<p className="text-[0.9rem] text-ink-soft">
									{t(
										"You can change, pause or stop this any time. {name} always sees exactly what you share.",
										{ name: invite.inviterName },
									)}
								</p>
								<MaybeAlert tone="error" message={failed} />
								<SubmitButton pending={pending} pendingLabel={t("Joining…")}>
									{t("Join {name}'s circle", { name: invite.inviterName })}
								</SubmitButton>
							</form>
						)}
					</>
				)}
			</div>
		</AuthLayout>
	);
}
