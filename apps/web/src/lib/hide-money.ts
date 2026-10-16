import { useSyncExternalStore } from "react";

const KEY = "spendid.hideMoney";
const listeners = new Set<() => void>();

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

let hidden = read();

function apply(): void {
	document.documentElement.toggleAttribute("data-hide-money", hidden);
}
apply();

/** Hide balances (SP-31): blur every amount on screen. Remembered on this device only. */
export const hideMoney = {
	get: () => hidden,
	set(next: boolean): void {
		hidden = next;
		try {
			localStorage.setItem(KEY, next ? "1" : "0");
		} catch {
			// Storage blocked: still hides for this visit.
		}
		apply();
		for (const l of listeners) l();
	},
	toggle: () => hideMoney.set(!hidden),
};

export function useHideMoney(): boolean {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => hidden,
	);
}
