import { type RefObject, useEffect } from "react";

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, newest last: only the top one answers Esc and Tab. */
const open: RefObject<HTMLElement | null>[] = [];

/** Keeps Tab and Shift+Tab inside the panel, wrapping at either end. */
function trapTab(e: KeyboardEvent, panel: HTMLElement): void {
	const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => el.getClientRects().length > 0,
	);
	const first = items[0];
	const last = items.at(-1);
	const active = document.activeElement;
	if (!first || !last) {
		e.preventDefault();
		panel.focus();
	} else if (!panel.contains(active)) {
		e.preventDefault();
		first.focus();
	} else if (e.shiftKey && (active === first || active === panel)) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && active === last) {
		e.preventDefault();
		first.focus();
	}
}

/**
 * Dialog behaviour for Sheet and Drawer: Esc closes, focus moves in (to `[data-autofocus]`
 * or the panel), stays in while open, and goes back where it was on close.
 */
export function useModal(
	isOpen: boolean,
	onClose: () => void,
	panelRef: RefObject<HTMLElement | null>,
): void {
	useEffect(() => {
		if (!isOpen) return;
		const previous = document.activeElement as HTMLElement | null;
		open.push(panelRef);
		const onKey = (e: KeyboardEvent) => {
			if (open.at(-1) !== panelRef) return;
			if (e.key === "Escape") onClose();
			else if (e.key === "Tab" && panelRef.current)
				trapTab(e, panelRef.current);
		};
		window.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		requestAnimationFrame(() => {
			const target =
				panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
				panelRef.current;
			target?.focus();
		});
		return () => {
			window.removeEventListener("keydown", onKey);
			open.splice(open.indexOf(panelRef), 1);
			if (open.length === 0) document.body.style.overflow = "";
			previous?.focus?.();
		};
	}, [isOpen, onClose, panelRef]);
}
