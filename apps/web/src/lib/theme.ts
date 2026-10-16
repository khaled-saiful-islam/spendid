import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "spendid-theme";

function current(): Theme {
	return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Light/dark toggle. The initial theme is set in index.html before paint. */
export function useTheme(): { theme: Theme; toggle: () => void } {
	const [theme, setTheme] = useState<Theme>(current);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	const toggle = useCallback(() => {
		const next: Theme = current() === "dark" ? "light" : "dark";
		try {
			localStorage.setItem(KEY, next);
		} catch {
			// Private mode: the toggle still works for this visit.
		}
		const apply = () => setTheme(next);
		if (document.startViewTransition) document.startViewTransition(apply);
		else apply();
	}, []);

	return { theme, toggle };
}
