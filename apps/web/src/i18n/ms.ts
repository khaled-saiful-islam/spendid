import { msA } from "./ms/a";
import { msB } from "./ms/b";
import { msC } from "./ms/c";
import { msD } from "./ms/d";
import { msE } from "./ms/e";

/**
 * Bahasa Melayu. Keys are the English text exactly as written in the app.
 * Missing keys fall back to English, so new screens never break.
 */
export const ms: Record<string, string> = {
	...msA,
	...msB,
	...msC,
	...msD,
	...msE,
};
