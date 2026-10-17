import {
	CHALLENGE_KINDS,
	CHALLENGES,
	type ChallengeKind,
} from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	closestWord,
	major,
	NOT_SAVED,
	offerTo,
	type SideChannel,
	type ToolDeps,
	WordSchema,
} from "./context";

/** Words for each challenge: its id and its title ("no-spend weekend", "cook-at-home week"). */
const WORDS: Record<string, ChallengeKind> = Object.fromEntries(
	CHALLENGE_KINDS.flatMap((k) => [
		[k, k],
		[CHALLENGES[k].title.toLowerCase(), k],
	]),
);

/** Challenges: see how they're going, start one, or stop one. */
export function challengeTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
) {
	const service = deps.challenges;
	if (!service) return [];
	const offer = offerTo(side);

	const challengesOverview = tool(
		async () => {
			const b = await service.board(ctx.userId);
			return JSON.stringify({
				running: b.active.map((c) => ({
					challenge: CHALLENGES[c.kind].title,
					status: c.result.status,
					daysDone: c.result.days.filter((d) => d.state === "pass").length,
					days: c.result.days.length,
					from: c.start,
					to: c.end,
					target:
						c.targetMinor === null ? null : major(c.targetMinor, c.currency),
				})),
				won: b.won.map((c) => CHALLENGES[c.kind].title),
				canStart: CHALLENGE_KINDS.map(
					(k) => `${CHALLENGES[k].title}: ${CHALLENGES[k].body}`,
				),
			});
		},
		{
			name: "challenges_overview",
			description:
				"The person's running challenges (days done), the ones won, and the challenges they can start.",
			schema: z.object({}),
		},
	);

	const proposeChallenge = tool(
		async (input) => {
			const word = closestWord(input.challenge, Object.keys(WORDS));
			const kind = word ? WORDS[word] : undefined;
			if (!kind)
				return `Unknown challenge. One of: ${CHALLENGE_KINDS.map((k) => CHALLENGES[k].title).join(", ")}.`;
			const b = await service.board(ctx.userId);
			if (input.stop) {
				const running = b.active.find(
					(c) => c.kind === kind && c.result.status === "active",
				);
				if (!running) return `${CHALLENGES[kind].title} isn't running.`;
				return (
					offer({
						kind: "challenge-stop",
						challengeId: running.id,
						challenge: kind,
					}) ?? NOT_SAVED
				);
			}
			if (b.active.some((c) => c.kind === kind && c.result.status === "active"))
				return `${CHALLENGES[kind].title} is already running.`;
			const targetMinor =
				kind === "eat-out-cap"
					? b.suggested.eatOutWeekMinor
					: kind === "daily-cap"
						? b.suggested.dailyMinor
						: null;
			return (
				offer({
					kind: "challenge-start",
					challenge: kind,
					targetMinor: targetMinor && targetMinor > 0 ? targetMinor : null,
					currency: ctx.homeCurrency,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_challenge",
			description:
				"Start a challenge (\"start a no-spend weekend\") or stop one that's running (stop: true). Spendid checks it from the person's spending; caps get a target a little under their usual.",
			schema: z.object({
				challenge: WordSchema(
					CHALLENGE_KINDS.map((k) => CHALLENGES[k].title.toLowerCase()),
				),
				stop: z.boolean().nullish(),
			}),
		},
	);

	return [challengesOverview, proposeChallenge];
}
