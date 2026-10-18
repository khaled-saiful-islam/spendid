import { useEffect, useState } from "react";

/**
 * Installing Spendid as an app (a PWA). Chrome, Edge and Samsung Internet offer an install
 * prompt we can show on a tap; iPhones and iPads install from Safari's Share menu instead.
 */

export type InstallPlatform = "ios" | "android" | "desktop";

/** Which install steps to show. iPads asking for the desktop site report a Mac with touch. */
export function installPlatform(
	userAgent: string,
	maxTouchPoints: number,
): InstallPlatform {
	if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
	if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
	if (/Android/i.test(userAgent)) return "android";
	return "desktop";
}

interface InstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => {
	for (const l of listeners) l();
};

// Caught as early as possible: the browser fires this once, often before any screen loads.
if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (e) => {
		e.preventDefault();
		deferred = e as InstallPromptEvent;
		notify();
	});
	window.addEventListener("appinstalled", () => {
		deferred = null;
		installedNow = true;
		notify();
	});
}

function runningInstalled(): boolean {
	if (typeof window === "undefined") return false;
	return (
		installedNow ||
		window.matchMedia?.("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export interface InstallState {
	/** Opened from the home screen (or just installed): no need to offer it. */
	installed: boolean;
	/** The browser will show its own install dialog when asked. */
	canPrompt: boolean;
	platform: InstallPlatform;
	/** Shows the browser's install dialog; true when the person said yes. */
	prompt: () => Promise<boolean>;
}

export function useInstall(): InstallState {
	const [, rerender] = useState(0);
	useEffect(() => {
		const update = () => rerender((n) => n + 1);
		listeners.add(update);
		return () => {
			listeners.delete(update);
		};
	}, []);

	return {
		installed: runningInstalled(),
		canPrompt: deferred !== null,
		platform:
			typeof navigator === "undefined"
				? "desktop"
				: installPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
		prompt: async () => {
			const event = deferred;
			if (!event) return false;
			await event.prompt();
			const { outcome } = await event.userChoice;
			deferred = null;
			notify();
			return outcome === "accepted";
		},
	};
}
