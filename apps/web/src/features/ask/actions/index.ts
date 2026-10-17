import { changeSpecs } from "./changes";
import { createSpecs } from "./create";
import { moreSpecs } from "./more";
import type { ActionOf, ActionSpec, Kind, SpecMap } from "./spec";

/** Every card the assistant can prepare. TypeScript checks that each kind has one. */
export const SPECS: SpecMap = { ...createSpecs, ...changeSpecs, ...moreSpecs };

export function specFor<K extends Kind>(action: ActionOf<K>): ActionSpec<K> {
	return SPECS[action.kind] as unknown as ActionSpec<K>;
}

export type { RunResult } from "./spec";
