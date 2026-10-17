import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * The live pixel width of an element, so a chart can draw at its real size (text and dots
 * stay true, nothing stretches) and keep a fixed height on any screen.
 */
export function useWidth<T extends HTMLElement>(
	fallback: number,
): [RefObject<T | null>, number] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(fallback);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		setWidth(el.clientWidth || fallback);
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			const w = entry?.contentRect.width;
			if (w) setWidth(Math.round(w));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [fallback]);

	return [ref, width];
}
