import {
	type InviteCreated,
	RELATION_LABELS,
	RELATIONS,
	type Relation,
	type ShareLevel,
} from "@spendid/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { familyApi, refreshFamily } from "@/lib/family-api";
import { ApiError } from "@/lib/http";
import { LevelPicker } from "./parts";
import { QrCode } from "./QrCode";

const RELATION_EMOJI: Record<Relation, string> = {
	spouse: "💍",
	partner: "💞",
	parent: "🧓",
	child: "🧒",
	sibling: "🧑‍🤝‍🧑",
	other: "🏡",
};

function InviteForm({ onCreated }: { onCreated: (r: InviteCreated) => void }) {
	const queryClient = useQueryClient();
	const [relation, setRelation] = useState<Relation | null>(null);
	const [level, setLevel] = useState<ShareLevel>("totals");
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!relation) return setError("Pick who you're inviting.");
		setPending(true);
		setError(null);
		try {
			const created = await familyApi.invite({
				relation,
				level,
				email: email.trim() || undefined,
			});
			await refreshFamily(queryClient);
			onCreated(created);
		} catch (err) {
			setPending(false);
			setError(
				err instanceof ApiError
					? err.message
					: "Couldn't make the invite. Try again.",
			);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-5" noValidate>
			<fieldset>
				<legend className="mb-2 font-semibold">They're my…</legend>
				<div className="grid grid-cols-3 gap-2">
					{RELATIONS.map((r) => (
						<button
							key={r}
							type="button"
							aria-pressed={relation === r}
							onClick={() => setRelation(r)}
							className={cn(
								"flex flex-col items-center gap-1 rounded-tile border-2 px-2 py-3 font-semibold transition-[transform,background-color,border-color] active:scale-95",
								relation === r
									? "border-plum-500 bg-plum-500/10"
									: "border-line hover:bg-surface-2",
							)}
						>
							<span className="text-[1.6rem]" aria-hidden="true">
								{RELATION_EMOJI[r]}
							</span>
							<span className="text-[0.92rem]">{RELATION_LABELS[r]}</span>
						</button>
					))}
				</div>
			</fieldset>
			<LevelPicker
				legend="What you'll share with them"
				name="invite-level"
				value={level}
				onChange={setLevel}
			/>
			<p className="rounded-tile bg-surface-2 px-4 py-3 text-[0.92rem] text-ink-soft">
				They choose what they share back when they join. Either of you can
				change, pause or stop it any time, and the other person always sees it.
			</p>
			<Field
				label="Their email (optional)"
				type="email"
				autoComplete="off"
				value={email}
				placeholder="We'll email them the link"
				onChange={(e) => setEmail(e.target.value)}
			/>
			<MaybeAlert tone="error" message={error} />
			<SubmitButton pending={pending} pendingLabel="Making the link…">
				Create invite link
			</SubmitButton>
		</form>
	);
}

function InviteReady({
	created,
	onDone,
}: {
	created: InviteCreated;
	onDone: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const canShare = typeof navigator !== "undefined" && "share" in navigator;

	async function copy() {
		try {
			await navigator.clipboard.writeText(created.url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	}

	return (
		<div className="space-y-5 text-center">
			<p className="text-ink-soft">
				Let them scan this, or send the link. It works once and ends in 7 days.
			</p>
			<div className="flex justify-center">
				<QrCode text={created.url} label="QR code for the invite link" />
			</div>
			{created.invite.email && (
				<p className="inline-flex items-center gap-2 rounded-full bg-jade/12 px-4 py-2 font-semibold text-safe">
					<Mail className="size-4 shrink-0" aria-hidden="true" />
					<span className="break-all">Emailed to {created.invite.email}</span>
				</p>
			)}
			<p className="rounded-tile border-2 border-dashed border-line px-4 py-3 text-left text-[0.9rem] break-all">
				{created.url}
			</p>
			<div className="flex flex-wrap justify-center gap-2">
				<button
					type="button"
					onClick={() => void copy()}
					className={buttonClass("ink", "md")}
				>
					{copied ? (
						<Check className="size-5" aria-hidden="true" />
					) : (
						<Copy className="size-5" aria-hidden="true" />
					)}
					{copied ? "Copied" : "Copy link"}
				</button>
				{canShare && (
					<button
						type="button"
						onClick={() =>
							void navigator
								.share({
									title: "Join my Spendid family circle",
									url: created.url,
								})
								.catch(() => undefined)
						}
						className={buttonClass("ghost", "md", "border-2 border-line")}
					>
						<Share2 className="size-5" aria-hidden="true" /> Share
					</button>
				)}
			</div>
			<button
				type="button"
				onClick={onDone}
				className={buttonClass("coin", "lg", "w-full")}
			>
				Done
			</button>
		</div>
	);
}

/** Invite someone: relation and what I share, then a link, QR code and optional email. */
export function InviteSheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [created, setCreated] = useState<InviteCreated | null>(null);
	const close = () => {
		onClose();
		setTimeout(() => setCreated(null), 300);
	};
	return (
		<Sheet
			open={open}
			onClose={close}
			title={created ? "Your invite is ready" : "Invite to your circle"}
		>
			{created ? (
				<InviteReady created={created} onDone={close} />
			) : (
				<InviteForm onCreated={setCreated} />
			)}
		</Sheet>
	);
}
