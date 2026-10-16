import { useSyncExternalStore } from "react";
import { ms } from "./ms";

export type Lang = "en" | "ms";
export type Vars = Record<string, string | number>;

const KEY = "spendid.lang";
const listeners = new Set<() => void>();

function detect(): Lang {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved === "en" || saved === "ms") return saved;
	} catch {
		// Storage blocked: fall through to the browser language.
	}
	return typeof navigator !== "undefined" &&
		navigator.language.toLowerCase().startsWith("ms")
		? "ms"
		: "en";
}

let current: Lang = detect();
if (typeof document !== "undefined") document.documentElement.lang = current;

/**
 * The app language. Follows the profile when signed in; remembered on this device.
 * Switching reloads the app once, so every label (even ones built at load) changes.
 */
export function setLang(next: Lang): void {
	if (next === current) return;
	current = next;
	let saved = true;
	try {
		localStorage.setItem(KEY, next);
	} catch {
		saved = false;
	}
	document.documentElement.lang = next;
	for (const l of listeners) l();
	// Reload only when the choice survives the reload (blocked storage would loop).
	if (saved) window.location.reload();
}

export const getLang = (): Lang => current;

const fill = (text: string, vars?: Vars) =>
	vars
		? text.replace(/\{(\w+)\}/g, (m, k: string) =>
				k in vars ? String(vars[k]) : m,
			)
		: text;

/**
 * Translate: the English text is the key, so code stays readable and anything not yet
 * translated simply shows in English. `{name}` placeholders are filled from `vars`.
 */
export function t(text: string, vars?: Vars): string {
	return fill(current === "ms" ? (ms[text] ?? text) : text, vars);
}

/** Plural helper: t1("1 day", "{n} days", n). */
export function tn(one: string, many: string, n: number, vars?: Vars): string {
	return t(n === 1 ? one : many, { n, ...vars });
}

/** Locale for dates and numbers. */
export const dateLocale = (): string | undefined =>
	current === "ms" ? "ms-MY" : undefined;

/** Re-renders the component when the language changes; returns the translators. */
export function useT(): { t: typeof t; tn: typeof tn; lang: Lang } {
	const lang = useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		() => current,
	);
	return { t, tn, lang };
}
