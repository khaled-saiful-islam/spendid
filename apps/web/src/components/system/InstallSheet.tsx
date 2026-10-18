import {
	Check,
	Copy,
	Download,
	EllipsisVertical,
	type LucideIcon,
	MonitorDown,
	Share,
	Share2,
	SquarePlus,
} from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { t } from "@/i18n";
import { type InstallPlatform, useInstall } from "@/lib/install";

interface Step {
	Icon: LucideIcon;
	text: string;
}

export const INSTALL_STEPS: Record<InstallPlatform, Step[]> = {
	ios: [
		{ Icon: Share, text: "Open this page in Safari and tap Share" },
		{ Icon: SquarePlus, text: "Scroll down and tap Add to Home Screen" },
		{ Icon: Check, text: "Tap Add. Spendid is now on your home screen" },
	],
	android: [
		{ Icon: EllipsisVertical, text: "In Chrome, tap the menu (three dots)" },
		{ Icon: Download, text: "Tap Install app or Add to Home screen" },
		{ Icon: Check, text: "Tap Install. Spendid is now with your apps" },
	],
	desktop: [
		{
			Icon: MonitorDown,
			text: "In Chrome or Edge, click Install in the address bar",
		},
		{ Icon: Check, text: "Spendid opens in its own window, like an app" },
	],
};

/** Numbered steps with an icon each, for browsers that can't show their own install dialog. */
export function InstallSteps({ platform }: { platform: InstallPlatform }) {
	return (
		<ol className="space-y-2">
			{INSTALL_STEPS[platform].map(({ Icon, text }, i) => (
				<li
					key={text}
					className="flex items-center gap-3 rounded-tile bg-surface-2 px-3 py-2.5"
				>
					<span className="num grid size-7 shrink-0 place-items-center rounded-full bg-marigold text-[0.85rem] font-bold text-plum-900">
						{i + 1}
					</span>
					<span className="min-w-0 flex-1 text-[0.95rem]">{t(text)}</span>
					<Icon className="size-5 shrink-0 text-plum-500" aria-hidden="true" />
				</li>
			))}
		</ol>
	);
}

/**
 * Get Spendid as an app on this device, and pass it on: a QR code to scan, the link to copy,
 * or the phone's share menu. Works signed in or out.
 */
export function InstallSheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const install = useInstall();
	const [copied, setCopied] = useState(false);
	const link = window.location.origin;

	async function installNow() {
		if (await install.prompt()) {
			toast(t("Spendid is installed. Find it with your apps."));
			onClose();
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			toast(t("Couldn't copy. Press and hold the link to copy it."));
		}
	}

	async function share() {
		await navigator
			.share({
				title: "Spendid",
				text: t("Spendid tells you what's safe to spend today. Try it:"),
				url: link,
			})
			.catch(() => undefined);
	}

	return (
		<Sheet open={open} onClose={onClose} title={t("Get the Spendid app")}>
			<div className="space-y-5">
				{install.inApp && !install.installed && (
					<div className="rounded-tile border-2 border-marigold/60 bg-marigold/10 p-3">
						<p className="font-semibold">
							{install.inApp === "another app"
								? t(
										"You're in another app's browser, which can't install apps.",
									)
								: t("You're in {app}'s browser, which can't install apps.", {
										app: install.inApp,
									})}
						</p>
						<p className="mt-1 text-[0.92rem] text-ink-soft">
							{install.platform === "ios"
								? t(
										"Tap ⋯ or the compass icon, then Open in Safari. Then follow the steps below.",
									)
								: t(
										"Tap ⋮ at the top right, then Open in Chrome (or Open in browser). Then follow the steps below.",
									)}
						</p>
					</div>
				)}
				{install.installed ? (
					<p className="flex items-center gap-2 rounded-tile bg-jade/12 px-3 py-2.5 font-semibold text-safe">
						<Check className="size-5 shrink-0" aria-hidden="true" />
						{t("You're using the installed app on this device.")}
					</p>
				) : install.canPrompt ? (
					<div className="space-y-2">
						<p className="text-ink-soft">
							{t(
								"Open Spendid from your home screen like any app, full screen and quick to start.",
							)}
						</p>
						<button
							type="button"
							onClick={() => void installNow()}
							className={buttonClass("coin", "lg", "w-full")}
						>
							<Download className="size-5" aria-hidden="true" />{" "}
							{t("Install Spendid")}
						</button>
					</div>
				) : (
					<div className="space-y-2">
						<p className="text-ink-soft">
							{t(
								"Add Spendid to your home screen. It opens full screen like any app and updates itself.",
							)}
						</p>
						<InstallSteps platform={install.platform} />
					</div>
				)}

				<section
					aria-labelledby="share-spendid"
					className="space-y-3 border-t border-line pt-4"
				>
					<h3 id="share-spendid" className="font-sans text-[1rem] font-bold">
						{t("Share Spendid")}
					</h3>
					<div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
						<div className="w-40 shrink-0">
							<QrCode
								text={link}
								label={t("QR code that opens {link}", { link })}
							/>
						</div>
						<div className="w-full min-w-0 space-y-2">
							<p className="text-[0.9rem] text-ink-soft">
								{t(
									"Friends scan this with their phone camera, or you send them the link.",
								)}
							</p>
							<p className="rounded-tile bg-surface-2 px-3 py-2 font-semibold break-all">
								{link.replace(/^https?:\/\//, "")}
							</p>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => void copy()}
									className={buttonClass("ghost", "md", "border-2 border-line")}
								>
									{copied ? (
										<Check className="size-4 text-safe" aria-hidden="true" />
									) : (
										<Copy className="size-4" aria-hidden="true" />
									)}
									{copied ? t("Copied") : t("Copy link")}
								</button>
								{"share" in navigator && (
									<button
										type="button"
										onClick={() => void share()}
										className={buttonClass("ink", "md")}
									>
										<Share2 className="size-4" aria-hidden="true" />{" "}
										{t("Share")}
									</button>
								)}
							</div>
						</div>
					</div>
				</section>
			</div>
		</Sheet>
	);
}
