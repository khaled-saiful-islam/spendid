import { BellOff, BellRing, Moon, Send, Smartphone } from "lucide-react";
import { useState } from "react";
import { InstallSheet } from "@/components/system/InstallSheet";
import { buttonClass } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { type PushState, usePush } from "@/lib/push";
import { Toggle, useNotificationPrefs } from "../me/EmailSettings";

type Push = ReturnType<typeof usePush>;

function statusLine(state: PushState): string {
	if (state === "on")
		return t(
			"On. Bills due, price changes, goals reached and family moments arrive here, even when Spendid is closed.",
		);
	if (state === "needs-install")
		return t(
			"iPhones only allow notifications once Spendid is on your Home Screen.",
		);
	if (state === "blocked")
		return t(
			"Blocked for Spendid. Allow notifications in your browser's site settings, then come back.",
		);
	if (state === "unsupported")
		return t(
			"This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.",
		);
	return t(
		"Get bills due, price changes, goals reached and family moments on this phone, even when Spendid is closed.",
	);
}

function PushActions({
	push,
	onInstall,
}: {
	push: Push;
	onInstall: () => void;
}) {
	const { state, busy } = push;

	async function on() {
		const ok = await push.turnOn().catch(() => false);
		if (ok) {
			toast(t("Notifications are on for this phone."));
			await push.test().catch(() => undefined);
		} else if (Notification.permission !== "denied")
			toast(t("Notifications weren't turned on. Try again any time."));
	}

	async function sendTest() {
		try {
			const { delivered } = await push.test();
			toast(
				delivered > 0
					? t("Test sent. It should appear in a moment.")
					: t(
							"Couldn't reach this phone. Turn notifications off and on again.",
						),
			);
		} catch {
			toast(t("Couldn't send a test. Try again."));
		}
	}

	if (state === "off")
		return (
			<button
				type="button"
				onClick={() => void on()}
				disabled={busy}
				className={buttonClass("coin", "md", "mt-3")}
			>
				<BellRing className="size-[1.1rem]" aria-hidden="true" />
				{t("Turn on")}
			</button>
		);
	if (state === "needs-install")
		return (
			<button
				type="button"
				onClick={onInstall}
				className={buttonClass("coin", "md", "mt-3")}
			>
				<Smartphone className="size-[1.1rem]" aria-hidden="true" />
				{t("Install Spendid first")}
			</button>
		);
	if (state !== "on") return null;
	return (
		<div className="mt-3 flex flex-wrap gap-2">
			<button
				type="button"
				onClick={() => void sendTest()}
				className={buttonClass("ghost", "md", "border-2 border-line")}
			>
				<Send className="size-[1.1rem]" aria-hidden="true" />
				{t("Send a test")}
			</button>
			<button
				type="button"
				onClick={() => void push.turnOff()}
				disabled={busy}
				className={buttonClass("ghost", "md")}
			>
				{t("Turn off")}
			</button>
		</div>
	);
}

/**
 * "Notifications on this phone", with plain words for every case: iPhone not on the Home
 * Screen yet, blocked in settings, browser can't. `compact` is the slim nudge at the top of
 * the alerts list; it only shows while there's something to do.
 */
export function PushSwitch({ compact = false }: { compact?: boolean }) {
	const push = usePush();
	const [installing, setInstalling] = useState(false);
	const { state } = push;
	if (state === "loading" || state === "unavailable") return null;
	if (compact && state !== "off" && state !== "needs-install") return null;

	const Icon = state === "blocked" ? BellOff : BellRing;
	const actions = (
		<PushActions push={push} onInstall={() => setInstalling(true)} />
	);
	const sheet = (
		<InstallSheet open={installing} onClose={() => setInstalling(false)} />
	);

	if (compact)
		return (
			<section
				aria-labelledby="push-nudge-heading"
				className="mb-3 flex items-start gap-3 rounded-tile border border-line bg-surface-2/60 p-3"
			>
				<span
					className="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-rose-300 to-red-400 text-white"
					aria-hidden="true"
				>
					<Icon className="size-[1.1rem]" />
				</span>
				<div className="min-w-0 flex-1">
					<h3
						id="push-nudge-heading"
						className="font-sans text-[1rem] font-bold"
					>
						{t("Notifications on this phone")}
					</h3>
					<p className="mt-0.5 text-[0.9rem] leading-snug text-ink-soft">
						{statusLine(state)}
					</p>
					{actions}
				</div>
				{sheet}
			</section>
		);

	return (
		<section
			aria-labelledby="push-heading"
			className="rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<SectionHeader
				id="push-heading"
				title={t("Notifications on this phone")}
				icon={Icon}
				tint="rose"
				sub={statusLine(state)}
			/>
			{actions}
			<EveningReminder />
			{sheet}
		</section>
	);
}

/** 8 pm: how today went, and a nudge to add anything missed. Off until switched on. */
function EveningReminder() {
	const { data, save } = useNotificationPrefs();
	if (!data) return null;
	return (
		<div className="mt-4 rounded-tile bg-bg px-4">
			<Toggle
				icon={<Moon className="size-4 text-plum-500" aria-hidden="true" />}
				label={t("Evening reminder")}
				about={t(
					"At 8 pm: how today went, and a nudge to add anything you missed. On your phone and in the bell, never by email.",
				)}
				checked={data.eveningNudge}
				onChange={(on) => void save({ eveningNudge: on })}
			/>
		</div>
	);
}
