const KEY = "spendid.pendingInvite";
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Remembers an invite link across sign-up, email confirmation and onboarding, so the
 * person lands back on it. Browser storage can be blocked; then they just reopen the link.
 */
export const pendingInvite = {
	get(): string | null {
		try {
			const value = localStorage.getItem(KEY);
			return value && TOKEN.test(value) ? value : null;
		} catch {
			return null;
		}
	},
	set(token: string): void {
		try {
			localStorage.setItem(KEY, token);
		} catch {
			// Storage blocked: nothing to remember.
		}
	},
	clear(): void {
		try {
			localStorage.removeItem(KEY);
		} catch {
			// Storage blocked: nothing to clear.
		}
	},
};
