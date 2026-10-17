import {
	computeSplit,
	RELATIONS,
	type SHARE_LEVELS,
	type SplitInput,
	SplitInputSchema,
	toMinor,
} from "@spendid/shared";
import { tool } from "langchain";
import { z } from "zod";
import {
	type AskContext,
	closestWord,
	major,
	matchByName,
	NOT_SAVED,
	offerTo,
	type SideChannel,
	type ToolDeps,
	WordSchema,
} from "./context";

/** Plain words for what's shared. */
const LEVEL_WORDS: Record<string, (typeof SHARE_LEVELS)[number]> = {
	totals: "totals",
	categories: "categories",
	expenses: "transactions",
	transactions: "transactions",
	receipts: "receipts",
	everything: "receipts",
};
const level = (word: string | null | undefined) => {
	const w = closestWord(word, Object.keys(LEVEL_WORDS));
	return w ? LEVEL_WORDS[w] : undefined;
};
const keyOf = (name: string, used: Set<string>) => {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 30) || "person";
	let key = base;
	for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
	used.add(key);
	return key;
};

/** Family: what's shared, change or pause it, invite someone, split a bill. */
export function familyTools(
	deps: ToolDeps,
	ctx: AskContext,
	side: SideChannel,
) {
	const family = deps.family;
	if (!family) return [];
	const offer = offerTo(side);
	const cur = ctx.homeCurrency;

	const familyOverview = tool(
		async () => {
			const [o, jars] = await Promise.all([
				family.overview(ctx.userId),
				deps.jars?.overview(ctx.userId),
			]);
			return JSON.stringify({
				people: o.people.map((p) => ({
					name: p.name,
					relation: p.relation,
					iShare: p.iShare
						? `${p.iShare.level}${p.iShare.paused ? " (paused)" : ""}`
						: "nothing",
					theyShare: p.theyShare
						? `${p.theyShare.level}${p.theyShare.paused ? " (paused)" : ""}`
						: "nothing",
				})),
				openInvites: o.invites.length,
				sharedJars: (jars?.jars ?? []).map((j) => ({
					name: j.name,
					owner: j.mine ? "me" : j.ownerName,
					saved: major(j.savedMinor, j.currency),
					target: major(j.targetMinor, j.currency),
				})),
			});
		},
		{
			name: "family_overview",
			description:
				"The person's family circle: who, how they're related, what each side shares (or paused), open invites and shared savings jars.",
			schema: z.object({}),
		},
	);

	const proposeSharing = tool(
		async (input) => {
			const o = await family.overview(ctx.userId);
			const found = matchByName(o.people, input.person);
			if (!found?.iShare)
				return JSON.stringify({
					error: "Nobody in the circle with that name.",
					people: o.people.map((p) => p.name),
				});
			const nextLevel = level(input.level) ?? found.iShare.level;
			const paused = input.pause
				? true
				: input.resume
					? false
					: found.iShare.paused;
			if (nextLevel === found.iShare.level && paused === found.iShare.paused)
				return "That's already how it is. Ask what should change.";
			return (
				offer({
					kind: "share",
					personId: found.userId,
					personName: found.name,
					before: { level: found.iShare.level, paused: found.iShare.paused },
					level: nextLevel,
					paused,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_sharing",
			description:
				"Change what the person shares with someone in their circle (level: totals, categories, expenses or receipts), or pause / resume sharing with them. They always see the change.",
			schema: z.object({
				person: z.string().min(1).max(60),
				level: WordSchema(Object.keys(LEVEL_WORDS)).nullish(),
				pause: z.boolean().nullish(),
				resume: z.boolean().nullish(),
			}),
		},
	);

	const proposeInvite = tool(
		async (input) => {
			const relation =
				(closestWord(
					input.relation,
					RELATIONS,
				) as (typeof RELATIONS)[number]) ?? "other";
			const email = input.email?.trim() || null;
			if (email && !z.email().safeParse(email).success)
				return "That email doesn't look right. Ask for it again.";
			return (
				offer({
					kind: "invite",
					relation,
					level: level(input.level) ?? "totals",
					email,
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_invite",
			description:
				"Invite someone into the family circle: how they're related (spouse, partner, parent, child, sibling, other), what the person will share (totals, categories, expenses or receipts; totals if not said), and their email if given. They join only if they say yes too.",
			schema: z.object({
				relation: WordSchema(RELATIONS),
				level: WordSchema(Object.keys(LEVEL_WORDS)).nullish(),
				email: z.string().max(254).nullish(),
			}),
		},
	);

	const proposeSplit = tool(
		async (input) => {
			const o = await family.overview(ctx.userId);
			const used = new Set<string>(["me"]);
			const people: SplitInput["people"] = [
				{
					key: "me",
					name: (ctx.name ?? "Me").slice(0, 40),
					userId: ctx.userId,
				},
			];
			for (const raw of input.people) {
				const name = raw.trim().slice(0, 40);
				if (!name) continue;
				const inCircle = matchByName(o.people, name);
				people.push({
					key: keyOf(name, used),
					name: inCircle?.name.slice(0, 40) ?? name,
					userId: inCircle?.userId ?? null,
				});
			}
			const everyone = people.map((p) => p.key);
			const receipt = input.fromReceipt ? ctx.receipt : null;
			if (input.fromReceipt && !receipt)
				return "No receipt is attached to this question. Ask for the total instead.";
			let items: SplitInput["items"];
			let adjustMinor = 0;
			let currency = cur;
			let title = input.title?.trim() || "Bill";
			if (receipt) {
				const d = receipt.draft;
				currency = d.currency;
				title = input.title?.trim() || d.merchant || "Bill";
				items = d.items.map((it, i) => ({
					key: `i${i + 1}`,
					name: it.name.slice(0, 120),
					amountMinor: it.totalMinor,
					people: everyone,
				}));
				const itemsTotal = items.reduce((s, it) => s + it.amountMinor, 0);
				if (items.length === 0)
					items = [
						{
							key: "i1",
							name: title,
							amountMinor: d.totalMinor,
							people: everyone,
						},
					];
				else adjustMinor = d.totalMinor - itemsTotal;
			} else {
				if (!input.total || input.total <= 0)
					return "The total is missing. Ask how much the bill was.";
				items = [
					{
						key: "i1",
						name: title,
						amountMinor: toMinor(input.total, cur),
						people: everyone,
					},
				];
			}
			const split = SplitInputSchema.safeParse({
				title: title.slice(0, 80),
				currency,
				people,
				items,
				adjustMinor,
				receiptId: receipt?.id ?? null,
			});
			if (!split.success)
				return (
					split.error.issues[0]?.message ??
					"That split doesn't add up. Ask again."
				);
			const result = computeSplit(split.data);
			return (
				offer({
					kind: "split",
					input: split.data,
					shares: result.shares.map((s) => ({
						name: people.find((p) => p.key === s.key)?.name ?? s.key,
						totalMinor: s.totalMinor,
					})),
				}) ?? NOT_SAVED
			);
		},
		{
			name: "propose_split",
			description: `Split a bill evenly between the person and others ("split dinner 120 with Adam and Sam"). people: the other people's names (the person is included automatically). total in ${cur}. With fromReceipt, use the attached receipt's lines and total instead. Makes a link anyone can open to see their share.`,
			schema: z.object({
				title: z.string().max(80).nullish(),
				total: z.number().positive().nullish(),
				people: z.array(z.string().max(40)).min(1).max(20),
				fromReceipt: z.boolean().nullish(),
			}),
		},
	);

	return [familyOverview, proposeSharing, proposeInvite, proposeSplit];
}
