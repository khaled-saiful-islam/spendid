import {
	CHALLENGES,
	EMAIL_GROUP_INFO,
	formatMinor,
	LEVEL_INFO,
	RELATION_LABELS,
} from "@spendid/shared";
import {
	BellOff,
	Download,
	EyeOff,
	Languages,
	Mail,
	MoonStar,
	ReceiptText,
	Share2,
	UserPlus,
} from "lucide-react";
import { setLang, t } from "@/i18n";
import { delightApi } from "@/lib/delight-api";
import { familyApi } from "@/lib/family-api";
import { hideMoney } from "@/lib/hide-money";
import { api } from "@/lib/http";
import { receiptImageUrl } from "@/lib/receipts-api";
import { capture } from "../../capture/capture-store";
import { Change, IconTile, Note, Row, Title } from "./parts";
import type { ActionOf, SpecMap } from "./spec";

const family = { to: "/app/family", label: "See it in Family" };
const me = { to: "/app/me", label: "See it in Profile & settings" };

function ChallengeBody({ action }: { action: ActionOf<"challenge-start"> }) {
	const info = CHALLENGES[action.challenge];
	return (
		<Row
			visual={
				<span className="text-[2.6rem] leading-none" aria-hidden="true">
					{info.emoji}
				</span>
			}
		>
			<Title>{t(info.title)}</Title>
			<Note>{t(info.body)}</Note>
			{action.targetMinor !== null && (
				<p className="num font-semibold">
					{t("Target: {amount}", {
						amount: formatMinor(action.targetMinor, action.currency),
					})}
				</p>
			)}
		</Row>
	);
}

function ChallengeStopBody({ action }: { action: ActionOf<"challenge-stop"> }) {
	const info = CHALLENGES[action.challenge];
	return (
		<Row
			visual={
				<span className="text-[2.6rem] leading-none" aria-hidden="true">
					{info.emoji}
				</span>
			}
		>
			<Title>{t(info.title)}</Title>
			<Note>{t("Stops now. You can start it again whenever you like.")}</Note>
		</Row>
	);
}

const levelName = (l: keyof typeof LEVEL_INFO) => t(LEVEL_INFO[l].label);

function ShareBody({ action }: { action: ActionOf<"share"> }) {
	const { before: b } = action;
	return (
		<Row
			visual={
				<IconTile>
					<Share2 className="size-7" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{action.personName}</Title>
			{b.level !== action.level && (
				<Change from={levelName(b.level)} to={levelName(action.level)} />
			)}
			{b.paused !== action.paused && (
				<p className="font-semibold">
					{action.paused ? t("Pause sharing") : t("Share again")}
				</p>
			)}
			<Note>
				{action.paused
					? t("{name} sees nothing while it's paused, and is told.", {
							name: action.personName,
						})
					: t(LEVEL_INFO[action.level].sees)}
			</Note>
		</Row>
	);
}

function InviteBody({ action }: { action: ActionOf<"invite"> }) {
	return (
		<Row
			visual={
				<IconTile tone="jade">
					<UserPlus className="size-7" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{t(RELATION_LABELS[action.relation])}</Title>
			<p className="font-semibold">
				{t("You'll share: {level}", { level: levelName(action.level) })}
			</p>
			<Note>
				{action.email
					? t("An email goes to {email}. They join only if they say yes too.", {
							email: action.email,
						})
					: t("You get a link to send. They join only if they say yes too.")}
			</Note>
		</Row>
	);
}

function SplitBody({ action }: { action: ActionOf<"split"> }) {
	const { input } = action;
	const total =
		input.items.reduce((s, i) => s + i.amountMinor, 0) + input.adjustMinor;
	const money = (m: number) => formatMinor(m, input.currency);
	return (
		<Row
			visual={
				<IconTile tone="marigold">
					<ReceiptText className="size-7" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{input.title}</Title>
			<p className="num font-semibold">{money(total)}</p>
			<ul className="space-y-0.5 text-[0.95rem]">
				{action.shares.map((s, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed list
					<li key={i} className="flex flex-wrap justify-between gap-x-3">
						<span className="break-words">{i === 0 ? t("You") : s.name}</span>
						<span className="num font-semibold">{money(s.totalMinor)}</span>
					</li>
				))}
			</ul>
		</Row>
	);
}

function settingLine(c: ActionOf<"setting">["change"]): {
	icon: React.ReactNode;
	title: string;
	note: string;
} {
	if (c.setting === "language")
		return {
			icon: <Languages className="size-7" aria-hidden="true" />,
			title: c.locale === "ms" ? "Bahasa Melayu" : "English",
			note: t("The app, emails and Ask Spendid switch language."),
		};
	if (c.setting === "hide-amounts")
		return {
			icon: <EyeOff className="size-7" aria-hidden="true" />,
			title: c.on ? t("Hide amounts") : t("Show amounts"),
			note: t("On this device. The eye button switches it back."),
		};
	if (c.setting === "quiet-hours")
		return {
			icon: <MoonStar className="size-7" aria-hidden="true" />,
			title: t("Quiet hours {from}:00 to {to}:00", {
				from: c.start,
				to: c.end,
			}),
			note: t("Emails that would arrive then wait until it ends."),
		};
	return {
		icon: c.on ? (
			<Mail className="size-7" aria-hidden="true" />
		) : (
			<BellOff className="size-7" aria-hidden="true" />
		),
		title: t(EMAIL_GROUP_INFO[c.group].label),
		note: c.on ? t("These emails turn on.") : t("These emails turn off."),
	};
}

function SettingBody({ action }: { action: ActionOf<"setting"> }) {
	const line = settingLine(action.change);
	return (
		<Row visual={<IconTile>{line.icon}</IconTile>}>
			<Title>{line.title}</Title>
			<Note>{line.note}</Note>
		</Row>
	);
}

function ExportBody() {
	return (
		<Row
			visual={
				<IconTile tone="jade">
					<Download className="size-7" aria-hidden="true" />
				</IconTile>
			}
		>
			<Title>{t("All your data")}</Title>
			<Note>
				{t(
					"Expenses, receipts, goals, family and settings in one PDF, with a spreadsheet attached. An email says when it's ready.",
				)}
			</Note>
		</Row>
	);
}

function ReceiptBody({ action }: { action: ActionOf<"receipt"> }) {
	return (
		<Row
			visual={
				<img
					src={receiptImageUrl(action.receiptId)}
					alt={t("The receipt you attached")}
					className="h-20 w-16 rounded-tile border border-line object-cover"
				/>
			}
		>
			<Title>{action.merchant ?? t("Receipt")}</Title>
			{action.totalMinor !== null && (
				<p className="num font-semibold">
					{formatMinor(action.totalMinor, action.currency)}
				</p>
			)}
			<Note>{t("Check the lines, then save it as one expense.")}</Note>
		</Row>
	);
}

async function applySetting(c: ActionOf<"setting">["change"]): Promise<void> {
	if (c.setting === "language") {
		await api("/api/me/locale", {
			method: "PUT",
			body: JSON.stringify({ locale: c.locale }),
		});
		setLang(c.locale);
	} else if (c.setting === "hide-amounts") hideMoney.set(c.on);
	else if (c.setting === "quiet-hours")
		await api("/api/me/notifications", {
			method: "PUT",
			body: JSON.stringify({ quietStart: c.start, quietEnd: c.end }),
		});
	else
		await api("/api/me/notifications", {
			method: "PUT",
			body: JSON.stringify({ [c.group]: c.on }),
		});
}

/** Challenges, family, settings, your data and an attached receipt. */
export const moreSpecs: Pick<
	SpecMap,
	| "challenge-start"
	| "challenge-stop"
	| "share"
	| "invite"
	| "split"
	| "setting"
	| "export"
	| "receipt"
> = {
	"challenge-start": {
		title: () => t("Start a challenge"),
		confirm: () => t("Start it"),
		done: (a) =>
			t("{title} started. Spendid will keep track.", {
				title: t(CHALLENGES[a.challenge].title),
			}),
		Body: ChallengeBody,
		run: async (a) => {
			await delightApi.startChallenge({
				kind: a.challenge,
				...(a.targetMinor !== null && { targetMinor: a.targetMinor }),
			});
			return undefined;
		},
		link: () => ({ to: "/app/plan", label: "See it in your plan" }),
	},
	"challenge-stop": {
		title: () => t("Stop a challenge"),
		confirm: () => t("Stop it"),
		done: (a) =>
			t("{title} stopped.", { title: t(CHALLENGES[a.challenge].title) }),
		Body: ChallengeStopBody,
		run: async (a) => {
			await delightApi.giveUpChallenge(a.challengeId);
			return undefined;
		},
		careful: true,
	},
	share: {
		title: () => t("Change what you share"),
		confirm: (a) =>
			a.paused && !a.before.paused ? t("Pause sharing") : t("Save change"),
		done: (a) => t("Updated. {name} sees the change.", { name: a.personName }),
		Body: ShareBody,
		run: async (a) => {
			await familyApi.share(a.personId, { level: a.level, paused: a.paused });
			return undefined;
		},
		undo: async (a) => {
			await familyApi.share(a.personId, a.before);
		},
		link: () => family,
	},
	invite: {
		title: () => t("Invite to your circle"),
		confirm: () => t("Create invite"),
		done: () => t("Invite ready. Send the link."),
		Body: InviteBody,
		run: async (a) => {
			const created = await familyApi.invite({
				relation: a.relation,
				level: a.level,
				...(a.email && { email: a.email }),
			});
			return { url: created.url };
		},
		link: () => family,
	},
	split: {
		title: () => t("Split a bill"),
		confirm: () => t("Create split link"),
		done: () => t("Split ready. Send the link; it opens without an account."),
		Body: SplitBody,
		run: async (a) => {
			const split = await familyApi.createSplit(a.input);
			return split.url ? { url: split.url } : undefined;
		},
		link: () => family,
	},
	setting: {
		title: () => t("Change a setting"),
		confirm: () => t("Change it"),
		done: () => t("Setting changed."),
		Body: SettingBody,
		run: async (a) => {
			await applySetting(a.change);
			return undefined;
		},
		// Quiet hours: the old hours aren't known, so no undo.
		canUndo: (a) => a.change.setting !== "quiet-hours",
		undo: async (a) => {
			const c = a.change;
			if (c.setting === "language")
				await applySetting({ ...c, locale: c.locale === "ms" ? "en" : "ms" });
			else if (c.setting === "hide-amounts" || c.setting === "email")
				await applySetting({ ...c, on: !c.on });
		},
		link: () => me,
	},
	export: {
		title: () => t("Download your data"),
		confirm: () => t("Prepare download"),
		done: () =>
			t("Being prepared. You'll get an email, and it'll be under Your data."),
		Body: ExportBody,
		run: async () => {
			await api("/api/me/export", { method: "POST" });
			return undefined;
		},
		link: () => me,
	},
	receipt: {
		title: () => t("Your receipt"),
		confirm: () => t("Check and save"),
		done: () => t("Opened. Save it from there."),
		Body: ReceiptBody,
		run: async (a) => {
			capture.openReceipt(a.receiptId);
			return undefined;
		},
	},
};
