/** Per-device app-lock settings and the rule for when Spendid asks for a passkey. */

export const LOCK_AFTER_MS = 5 * 60_000;

const ENABLED_KEY = "spendid-lock";
const UNLOCKED_KEY = "spendid-unlocked";

export interface LockState {
	/** The person turned app lock on for this device. */
	enabled: boolean;
	/** They unlocked during this visit (survives reloads in the same tab, not a new app open). */
	unlockedThisVisit: boolean;
	/** When the app was last sent to the background, if it is now hidden or just came back. */
	hiddenAt: number | null;
}

/**
 * Lock on a fresh open of the app, or after it sat in the background for LOCK_AFTER_MS.
 * Quick app switches (checking a message, copying an amount) don't ask again.
 */
export function shouldLock(state: LockState, now: number): boolean {
	if (!state.enabled) return false;
	if (!state.unlockedThisVisit) return true;
	return state.hiddenAt !== null && now - state.hiddenAt >= LOCK_AFTER_MS;
}

function read(storage: () => Storage, key: string): string | null {
	try {
		return storage().getItem(key);
	} catch {
		return null;
	}
}

function write(
	storage: () => Storage,
	key: string,
	value: string | null,
): void {
	try {
		if (value === null) storage().removeItem(key);
		else storage().setItem(key, value);
	} catch {
		// Storage blocked (private mode): lock simply stays off on this device.
	}
}

export const lockStorage = {
	isEnabled: () => read(() => localStorage, ENABLED_KEY) === "1",
	setEnabled: (on: boolean) =>
		write(() => localStorage, ENABLED_KEY, on ? "1" : null),
	wasUnlocked: () => read(() => sessionStorage, UNLOCKED_KEY) === "1",
	setUnlocked: (on: boolean) =>
		write(() => sessionStorage, UNLOCKED_KEY, on ? "1" : null),
};
