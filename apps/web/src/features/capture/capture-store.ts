import type { Transaction } from "@spendid/shared";
import { useSyncExternalStore } from "react";

export type CaptureState =
	| { view: "closed" }
	| { view: "menu" }
	| { view: "type" }
	| { view: "edit"; transaction: Transaction };

let state: CaptureState = { view: "closed" };
const listeners = new Set<() => void>();

function set(next: CaptureState): void {
	state = next;
	for (const l of listeners) l();
}

/** Any screen can open the add flow or edit an expense; the shell renders the sheets. */
export const capture = {
	openMenu: () => set({ view: "menu" }),
	openType: () => set({ view: "type" }),
	edit: (transaction: Transaction) => set({ view: "edit", transaction }),
	close: () => set({ view: "closed" }),
};

export function useCapture(): CaptureState {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => state,
	);
}
