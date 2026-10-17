/**
 * A short vibration paired with an animation, where the device supports it (Android browsers).
 * iPhones ignore it; the animation carries the moment there. Respects reduced motion.
 */
const PATTERNS: Record<"tap" | "success" | "warn", number | number[]> = {
	tap: 8,
	success: [12, 40, 18],
	warn: [30, 60, 30],
};

export function buzz(kind: keyof typeof PATTERNS = "tap"): void {
	try {
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		navigator.vibrate?.(PATTERNS[kind]);
	} catch {
		// Vibration is a nicety; some browsers throw when it's blocked by policy.
	}
}
