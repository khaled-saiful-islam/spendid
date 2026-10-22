import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { Field } from "@/components/form/Field";
import { SubmitButton } from "@/components/form/SubmitButton";
import { toast } from "@/components/ui/Toast";
import { type AdminPerson, adminApi } from "@/lib/admin-api";
import { cn } from "@/lib/cn";

export type PersonAction = "ai" | "pause" | "delete";

function useRun(onDone: () => void) {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const run = async (fn: () => Promise<unknown>, message: string) => {
		setPending(true);
		setError(null);
		try {
			await fn();
			await queryClient.invalidateQueries({ queryKey: ["admin"] });
			toast(message);
			onDone();
		} catch (err) {
			setPending(false);
			setError(
				err instanceof Error ? err.message : "That didn't work. Try again.",
			);
		}
	};
	return { pending, error, run };
}

/** The 1st of next month in Malaysia time, when every AI allowance renews. */
function renewsOn(now: Date = new Date()): string {
	const [y, m] = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Kuala_Lumpur",
		year: "numeric",
		month: "2-digit",
	})
		.format(now)
		.split("-")
		.map(Number) as [number, number];
	return new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

export function AiLimitForm({
	person,
	defaultTokens,
	onDone,
}: {
	person: AdminPerson;
	defaultTokens: number;
	onDone: () => void;
}) {
	const [custom, setCustom] = useState(person.ai.limitTokens !== null);
	const [tokens, setTokens] = useState(
		String(person.ai.limitTokens ?? defaultTokens),
	);
	const [enabled, setEnabled] = useState(person.ai.enabled);
	const { pending, error, run } = useRun(onDone);

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		const monthly = custom ? Number(tokens) : null;
		void run(
			() => adminApi.setAi(person.id, monthly, enabled),
			`AI settings saved for ${person.name}.`,
		);
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<label className="flex items-center justify-between gap-4 rounded-tile bg-bg px-4 py-3">
				<span className="font-semibold">AI on for {person.name}</span>
				<input
					type="checkbox"
					checked={enabled}
					onChange={(e) => setEnabled(e.target.checked)}
					className="size-6 accent-[var(--color-jade)]"
				/>
			</label>
			<fieldset className="space-y-2">
				<legend className="mb-1 font-semibold">Monthly allowance</legend>
				<p className="text-[0.9rem] text-ink-soft">
					Renews by itself on {renewsOn()} (midnight, Malaysia time), every
					month. Only switching AI off above stops it.
				</p>
				{[false, true].map((isCustom) => (
					<label
						key={String(isCustom)}
						className={cn(
							"flex items-center gap-3 rounded-tile border-2 px-4 py-3",
							custom === isCustom ? "border-plum-500" : "border-line",
						)}
					>
						<input
							type="radio"
							name="allowance"
							checked={custom === isCustom}
							onChange={() => setCustom(isCustom)}
						/>
						{isCustom
							? "Custom amount"
							: `App default (${new Intl.NumberFormat().format(defaultTokens)} tokens)`}
					</label>
				))}
			</fieldset>
			{custom && (
				<Field
					label="Tokens per month"
					inputMode="numeric"
					value={tokens}
					onChange={(e) => setTokens(e.target.value.replace(/\D/g, ""))}
				/>
			)}
			<MaybeAlert tone="error" message={error} />
			<SubmitButton pending={pending}>Save AI settings</SubmitButton>
		</form>
	);
}

export function PauseForm({
	person,
	onDone,
}: {
	person: AdminPerson;
	onDone: () => void;
}) {
	const [reason, setReason] = useState("");
	const { pending, error, run } = useRun(onDone);
	if (person.banned) {
		return (
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					void run(
						() => adminApi.restore(person.id),
						`${person.name} can sign in again.`,
					);
				}}
			>
				<p className="text-ink-soft">
					{person.name} will be able to sign in again, and we'll email them that
					their account is back.
				</p>
				<MaybeAlert tone="error" message={error} />
				<SubmitButton pending={pending}>Restore account</SubmitButton>
			</form>
		);
	}
	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				void run(
					() => adminApi.pause(person.id, reason.trim() || null),
					`${person.name}'s account is paused.`,
				);
			}}
		>
			<p className="text-ink-soft">
				They'll be signed out everywhere and can't sign in until you restore
				them. Nothing is deleted. We'll email them.
			</p>
			<Field
				label="Reason (sent to them, optional)"
				value={reason}
				maxLength={300}
				onChange={(e) => setReason(e.target.value)}
			/>
			<MaybeAlert tone="error" message={error} />
			<SubmitButton pending={pending} variant="ink">
				Pause account
			</SubmitButton>
		</form>
	);
}

export function DeleteForm({
	person,
	onDone,
}: {
	person: AdminPerson;
	onDone: () => void;
}) {
	const [typed, setTyped] = useState("");
	const { pending, error, run } = useRun(onDone);
	const matches = typed.trim().toLowerCase() === person.email.toLowerCase();
	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				matches &&
					void run(
						() => adminApi.remove(person.id),
						`${person.email} was deleted.`,
					);
			}}
		>
			<p className="text-ink-soft">
				This permanently deletes the account and everything in it. It can't be
				undone.
			</p>
			<Field
				label={`Type ${person.email} to confirm`}
				value={typed}
				autoComplete="off"
				onChange={(e) => setTyped(e.target.value)}
			/>
			<MaybeAlert tone="error" message={error} />
			<button
				type="submit"
				disabled={!matches || pending}
				className="h-14 w-full rounded-full bg-coral font-semibold text-white transition-opacity disabled:opacity-40"
			>
				{pending ? "Deleting…" : "Delete permanently"}
			</button>
		</form>
	);
}
