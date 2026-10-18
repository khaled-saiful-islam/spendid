import { useCallback, useEffect, useState } from "react";
import { api } from "./http";
import { installPlatform } from "./install";

/**
 * Phone notifications (web push). iPhones only allow them once Spendid is on the Home
 * Screen; everywhere else they work in the browser too. Asking for permission only ever
 * happens on a tap.
 */
export type PushState =
	| "loading"
	/** This server has no push keys: hide the switch. */
	| "unavailable"
	/** This browser can't do push at all. */
	| "unsupported"
	/** iPhone/iPad in a Safari tab: install first. */
	| "needs-install"
	/** The person said no before; only browser settings can change that. */
	| "blocked"
	| "off"
	| "on";

/** VAPID keys come base64url-encoded; the browser wants raw bytes. */
export function keyToBytes(base64url: string): Uint8Array {
	const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const raw = atob(padded);
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function supported(): boolean {
	return (
		typeof window !== "undefined" &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

function standalone(): boolean {
	return (
		window.matchMedia?.("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** The app's service worker (it also shows the notifications), registering it if needed. */
async function worker(): Promise<ServiceWorkerRegistration> {
	const existing = await navigator.serviceWorker.getRegistration();
	if (!existing) await navigator.serviceWorker.register("/sw.js");
	return navigator.serviceWorker.ready;
}

export function usePush() {
	const [state, setState] = useState<PushState>("loading");
	const [key, setKey] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		const { publicKey } = await api<{ publicKey: string | null }>(
			"/api/push/key",
		).catch(() => ({ publicKey: null }));
		setKey(publicKey);
		if (!publicKey) return setState("unavailable");
		const ios =
			installPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0) ===
			"ios";
		if (ios && !standalone()) return setState("needs-install");
		if (!supported()) return setState("unsupported");
		if (Notification.permission === "denied") return setState("blocked");
		const reg = await navigator.serviceWorker.getRegistration();
		const sub = await reg?.pushManager.getSubscription();
		setState(sub ? "on" : "off");
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const turnOn = useCallback(async (): Promise<boolean> => {
		if (!key) return false;
		setBusy(true);
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setState(permission === "denied" ? "blocked" : "off");
				return false;
			}
			const reg = await worker();
			const sub =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: keyToBytes(key) as BufferSource,
				}));
			await api("/api/push/subscribe", {
				method: "POST",
				body: JSON.stringify(sub.toJSON()),
			});
			setState("on");
			return true;
		} finally {
			setBusy(false);
		}
	}, [key]);

	const turnOff = useCallback(async () => {
		setBusy(true);
		try {
			const reg = await navigator.serviceWorker.getRegistration();
			const sub = await reg?.pushManager.getSubscription();
			if (sub) {
				await api("/api/push/unsubscribe", {
					method: "POST",
					body: JSON.stringify({ endpoint: sub.endpoint }),
				}).catch(() => undefined);
				await sub.unsubscribe();
			}
			setState("off");
		} finally {
			setBusy(false);
		}
	}, []);

	const test = useCallback(
		() =>
			api<{ delivered: number }>("/api/push/test", {
				method: "POST",
				body: "{}",
			}),
		[],
	);

	return { state, busy, turnOn, turnOff, test };
}
