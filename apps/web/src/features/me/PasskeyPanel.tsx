import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { MaybeAlert } from "@/components/form/Alert";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { formatMoment } from "@/lib/time";
import { lockStorage } from "../lock/policy";

const passkeysQuery = {
	queryKey: ["passkeys"],
	queryFn: async () => {
		const { data, error } = await authClient.passkey.listUserPasskeys();
		if (error) throw new Error(t("Couldn't load your passkeys."));
		return data ?? [];
	},
};

function deviceName(): string {
	const ua = navigator.userAgent;
	if (/iPhone|iPad/.test(ua)) return t("iPhone or iPad");
	if (/Android/.test(ua)) return t("Android phone");
	if (/Mac/.test(ua)) return "Mac";
	if (/Windows/.test(ua)) return t("Windows PC");
	return t("This device");
}

/** Passkeys for quick sign-in, plus the per-device app lock switch. */
export function PasskeyPanel() {
	const queryClient = useQueryClient();
	const { data: passkeys = [], isPending } = useQuery(passkeysQuery);
	const [lockOn, setLockOn] = useState(lockStorage.isEnabled);
	const [message, setMessage] = useState<{
		tone: "error" | "success";
		text: string;
	} | null>(null);

	async function add() {
		setMessage(null);
		const result = await authClient.passkey.addPasskey({ name: deviceName() });
		if (result?.error)
			return setMessage({
				tone: "error",
				text: t(
					"Passkey wasn't added. Your device may have cancelled it — try again.",
				),
			});
		await queryClient.invalidateQueries({ queryKey: passkeysQuery.queryKey });
		setMessage({
			tone: "success",
			text: t("Passkey added. You can now unlock and sign in with it."),
		});
	}

	async function remove(id: string) {
		await authClient.passkey.deletePasskey({ id });
		const left = await queryClient.fetchQuery({
			...passkeysQuery,
			staleTime: 0,
		});
		if (left.length === 0) toggleLock(false);
	}

	function toggleLock(on: boolean) {
		lockStorage.setEnabled(on);
		if (on) lockStorage.setUnlocked(true);
		setLockOn(on);
	}

	return (
		<section
			aria-labelledby="lock-heading"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<SectionHeader
				id="lock-heading"
				title={t("App lock")}
				icon={Fingerprint}
				tint="teal"
				sub={t(
					"Open Spendid with your fingerprint, face or device PIN, so nobody can glance at your money.",
				)}
			/>

			<div className="mt-4 space-y-3">
				<MaybeAlert tone={message?.tone ?? "success"} message={message?.text} />
				{!isPending && passkeys.length > 0 && (
					<ul className="space-y-2">
						{passkeys.map((p) => (
							<li
								key={p.id}
								className="flex items-center gap-3 rounded-tile bg-bg px-4 py-3"
							>
								<KeyRound
									className="size-5 shrink-0 text-ink-soft"
									aria-hidden="true"
								/>
								<span className="min-w-0 flex-1">
									<span className="block font-medium">
										{p.name ?? t("Passkey")}
									</span>
									<span className="block text-[0.85rem] text-ink-soft">
										{t("Added")}{" "}
										{formatMoment(p.createdAt, {
											day: "numeric",
											month: "short",
											year: "numeric",
										})}
									</span>
								</span>
								<button
									type="button"
									onClick={() => void remove(p.id)}
									aria-label={t("Remove passkey {name}", {
										name: p.name ?? "",
									})}
									className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-coral/12 hover:text-over"
								>
									<Trash2 className="size-5" />
								</button>
							</li>
						))}
					</ul>
				)}
				<button
					type="button"
					onClick={add}
					className={buttonClass("ghost", "md", "w-full border-2 border-line")}
				>
					<Fingerprint className="size-5" aria-hidden="true" />
					{passkeys.length > 0
						? t("Add another passkey")
						: t("Set up a passkey")}
				</button>

				<label
					className={cn(
						"flex items-center justify-between gap-4 rounded-tile px-4 py-3",
						passkeys.length === 0 ? "opacity-50" : "bg-bg",
					)}
				>
					<span>
						<span className="block font-medium">
							{t("Lock Spendid when I come back")}
						</span>
						<span className="block text-[0.85rem] text-ink-soft">
							{passkeys.length === 0
								? t("Set up a passkey first.")
								: t("On this device, after 5 minutes away.")}
						</span>
					</span>
					<input
						type="checkbox"
						role="switch"
						aria-checked={lockOn}
						checked={lockOn}
						disabled={passkeys.length === 0}
						onChange={(e) => toggleLock(e.target.checked)}
						className="peer sr-only"
					/>
					<span
						aria-hidden="true"
						className="relative h-8 w-14 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-jade peer-focus-visible:outline-3 peer-focus-visible:outline-marigold after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-6"
					/>
				</label>
			</div>
		</section>
	);
}
