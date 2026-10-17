import { profile } from "@spendid/db";
import { EMAIL_GROUPS } from "@spendid/shared";
import { eq } from "drizzle-orm";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	closestWord,
	NOT_SAVED,
	offerTo,
	type SideChannel,
	type ToolDeps,
	WordSchema,
} from "./context";

const SETTINGS = ["language", "hide amounts", "quiet hours", "email"] as const;
const LANGUAGE_WORDS: Record<string, "en" | "ms"> = {
	english: "en",
	en: "en",
	malay: "ms",
	"bahasa melayu": "ms",
	melayu: "ms",
	ms: "ms",
};

/** Settings (language, hidden amounts, quiet hours, email choices) and downloading all data. */
export function settingsTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
) {
	const offer = offerTo(side);
	const notifier = deps.notifier;

	const settingsOverview = tool(
		async () => {
			const [p] = await deps.db
				.select({ locale: profile.locale })
				.from(profile)
				.where(eq(profile.userId, ctx.userId))
				.limit(1);
			const prefs = notifier ? await notifier.prefs(ctx.userId) : null;
			return JSON.stringify({
				language: p?.locale === "ms" ? "Bahasa Melayu" : "English",
				hideAmountsOnScreen: "a switch on each device (the eye button)",
				emails: prefs
					? Object.fromEntries(
							EMAIL_GROUPS.map((g) => [g, prefs[g] ? "on" : "off"]),
						)
					: null,
				hideAmountsInEmails: prefs?.hideAmounts ?? null,
				quietHours: prefs
					? `${prefs.quietStart}:00 to ${prefs.quietEnd}:00`
					: null,
			});
		},
		{
			name: "settings_overview",
			description:
				"The person's settings: language, which emails are on, amounts hidden in emails, and quiet hours.",
			schema: z.object({}),
		},
	);

	const proposeSetting = tool(
		async (input) => {
			const setting = closestWord(input.setting, SETTINGS);
			if (setting === "language") {
				const w = closestWord(input.language, Object.keys(LANGUAGE_WORDS));
				const locale = w ? LANGUAGE_WORDS[w] : undefined;
				if (!locale) return "Which language: English or Bahasa Melayu?";
				return (
					offer({ kind: "setting", change: { setting: "language", locale } }) ??
					NOT_SAVED
				);
			}
			if (setting === "hide amounts")
				return (
					offer({
						kind: "setting",
						change: { setting: "hide-amounts", on: input.on ?? true },
					}) ?? NOT_SAVED
				);
			if (setting === "quiet hours") {
				if (input.quietStart == null || input.quietEnd == null)
					return "Ask from what hour to what hour (0-23).";
				return (
					offer({
						kind: "setting",
						change: {
							setting: "quiet-hours",
							start: input.quietStart,
							end: input.quietEnd,
						},
					}) ?? NOT_SAVED
				);
			}
			if (setting === "email") {
				const group = closestWord(input.email, EMAIL_GROUPS) as
					| (typeof EMAIL_GROUPS)[number]
					| null;
				if (!group) return `Which emails? One of: ${EMAIL_GROUPS.join(", ")}.`;
				return (
					offer({
						kind: "setting",
						change: { setting: "email", group, on: input.on ?? false },
					}) ?? NOT_SAVED
				);
			}
			return `Unknown setting. One of: ${SETTINGS.join(", ")}.`;
		},
		{
			name: "propose_setting",
			description: `Change a setting: language (english or malay), hide amounts on this screen (on true/false), quiet hours for emails (quietStart and quietEnd, hours 0-23), or one kind of email on/off (email: ${EMAIL_GROUPS.join(", ")}). Passwords, passkeys and deleting the account are never done here: point to Profile & settings in the app.`,
			schema: z.object({
				setting: WordSchema(SETTINGS),
				language: z.string().max(20).nullish(),
				on: z.boolean().nullish(),
				quietStart: z.number().int().min(0).max(23).nullish(),
				quietEnd: z.number().int().min(0).max(23).nullish(),
				email: WordSchema(EMAIL_GROUPS).nullish(),
			}),
		},
	);

	const proposeExport = tool(
		async () => offer({ kind: "export" }) ?? NOT_SAVED,
		{
			name: "propose_export",
			description:
				"The person wants a copy of all their data (expenses as a spreadsheet, receipts, goals, family, settings). Prepares the download; an email says when it's ready.",
			schema: z.object({}),
		},
	);

	return [settingsOverview, proposeSetting, proposeExport];
}
