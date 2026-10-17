import type { AskAction } from "@spendid/shared";
import type { ReactNode } from "react";

export type Kind = AskAction["kind"];
export type ActionOf<K extends Kind> = Extract<AskAction, { kind: K }>;

/** What confirming may hand back: a link to share (an invite, a split). */
export type RunResult = { url: string } | undefined;

/**
 * Everything the app needs to show and carry out one kind of card. Confirming calls the same
 * API as the app's own buttons, so every rule and limit applies as if done by hand.
 */
export interface ActionSpec<K extends Kind> {
	title: (a: ActionOf<K>) => string;
	confirm: (a: ActionOf<K>) => string;
	done: (a: ActionOf<K>) => string;
	Body: (props: { action: ActionOf<K>; done: boolean }) => ReactNode;
	run: (a: ActionOf<K>) => Promise<RunResult | undefined>;
	/** Puts things back as they were; offered right after confirming. */
	undo?: (a: ActionOf<K>) => Promise<void>;
	/** When undo exists but can't apply to this particular card. */
	canUndo?: (a: ActionOf<K>) => boolean;
	/** Where to see the result. */
	link?: (a: ActionOf<K>) => { to: string; label: string } | null;
	/** Removes or stops something: the confirm button is the quieter, careful style. */
	careful?: boolean;
}

export type SpecMap = { [K in Kind]: ActionSpec<K> };
