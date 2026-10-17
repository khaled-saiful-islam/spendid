import type { Transaction } from "@spendid/shared";
import { useSyncExternalStore } from "react";

export type CaptureState =
	| { view: "closed" }
	| { view: "menu" }
	| { view: "type"; prefill?: TypePrefill }
	| { view: "voice" }
	| { view: "scan"; file?: File }
	| { view: "receipt"; receiptId: string }
	| { view: "edit"; transaction: Transaction };

/**
 * Start the Type-it form with known details (a wishlist item you decided to buy), or with
 * text shared from another app (a payment message), read like typed shorthand.
 */
export type TypePrefill =
	| { merchant: string; amountMinor: number; currency: string }
	| { text: string };

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
	openTypeWith: (prefill: TypePrefill) => set({ view: "type", prefill }),
	openVoice: () => set({ view: "voice" }),
	openScan: () => set({ view: "scan" }),
	/** A receipt photo or PDF shared from another app, straight into the reader. */
	openScanWith: (file: File) => set({ view: "scan", file }),
	openReceipt: (receiptId: string) => set({ view: "receipt", receiptId }),
	edit: (transaction: Transaction) => set({ view: "edit", transaction }),
	close: () => set({ view: "closed" }),
};

/** Current state without subscribing (for event handlers). */
export const getCaptureState = (): CaptureState => state;

export function useCapture(): CaptureState {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => state,
	);
}
