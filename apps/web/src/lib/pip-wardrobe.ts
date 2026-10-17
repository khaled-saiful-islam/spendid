import {
	festiveLook,
	type PipGift,
	pipLevel,
	type Streak,
} from "@spendid/shared";
import { useCallback, useState } from "react";
import { type Outfit, outfitFor } from "@/features/pip/PipOutfit";

const KEY = "spendid.pip.hidden";
export const HATS: PipGift[] = ["leaf", "explorer", "crown"];

function readHidden(): PipGift[] {
	try {
		const raw = localStorage.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as PipGift[]) : [];
	} catch {
		return [];
	}
}

const localToday = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * What Pip wears: every gift earned so far, minus any the person took off on this device.
 * A per-device nicety, so it lives in localStorage; nothing about money is stored.
 */
export function usePipLook(streak: Streak | undefined): {
	level: ReturnType<typeof pipLevel>;
	outfit: Outfit;
	hidden: PipGift[];
	toggle: (gift: PipGift) => void;
} {
	const [hidden, setHidden] = useState<PipGift[]>(readHidden);
	const level = pipLevel(streak?.loggedDays ?? 0);
	const wearing = level.gifts.filter((g) => !hidden.includes(g));
	const shownHat = outfitFor(wearing, null).hat;
	const toggle = useCallback(
		(gift: PipGift) => {
			setHidden((h) => {
				// One hat at a time: putting a hat on takes the others off.
				const isHat = HATS.includes(gift);
				const turningOn = isHat ? shownHat !== gift : h.includes(gift);
				const next = [
					...new Set(
						turningOn
							? [
									...h.filter((x) => x !== gift),
									...(isHat ? HATS.filter((x) => x !== gift) : []),
								]
							: [...h, gift],
					),
				];
				try {
					localStorage.setItem(KEY, JSON.stringify(next));
				} catch {
					// Storage blocked: the choice lasts for this visit.
				}
				return next;
			});
		},
		[shownHat],
	);
	return {
		level,
		outfit: outfitFor(wearing, festiveLook(localToday())),
		hidden,
		toggle,
	};
}
