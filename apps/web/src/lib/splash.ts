/** The animated splash stays at least this long, so it plays through instead of flashing. */
const MIN_MS = 1150;
const FADE_MS = 380;

/**
 * Hands over from the animated splash (index.html) to the app once it has drawn. Does nothing
 * when the splash isn't showing (a normal browser tab).
 */
export function hideSplash(): void {
	const root = document.documentElement;
	const splash = document.getElementById("splash");
	if (!splash || !root.classList.contains("splashing")) return;
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const wait = Math.max(0, (reduce ? 400 : MIN_MS) - performance.now());
	window.setTimeout(() => {
		splash.classList.add("out");
		window.setTimeout(() => {
			splash.remove();
			root.classList.remove("splashing");
		}, FADE_MS);
	}, wait);
}
