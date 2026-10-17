import { type Db, profile } from "@spendid/db";
import {
	type AiGuard,
	type ExpenseExtractor,
	type MerchantMemory,
	type SpokenExpense,
	type Transcriber,
	UnreadableAiAnswer,
} from "@spendid/server";
import {
	type Category,
	formatMinor,
	hasSpokenAmount,
	MAX_DAYS_BACK,
	type QuickEntry,
	quickReadSpoken,
	toMinor,
	type VoiceDraft,
	type VoiceResult,
	wordsToDigits,
} from "@spendid/shared";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../http/app-error";
import type { CategoryRepository } from "../money/categories.repository";

interface Deps {
	db: Db;
	guard: AiGuard;
	transcriber: Transcriber;
	extract: ExpenseExtractor;
	categories: CategoryRepository;
	asrModel: string;
	/** Learned shop names + categories, applied to drafts before review. */
	merchants?: MerchantMemory;
}

const KNOWN = new Set(Intl.supportedValuesOf("currency"));
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clampDays = (n: number) =>
	Math.min(MAX_DAYS_BACK, Math.max(0, Math.round(n)));

/** The person's own day: "2026-10-17" and "Saturday 2026-10-17" for the AI. */
function localToday(timeZone: string): { date: string; label: string } {
	const now = new Date();
	const date = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const weekday = new Intl.DateTimeFormat("en", {
		timeZone,
		weekday: "long",
	}).format(now);
	return { date, label: `${weekday} ${date}` };
}
/** Speech-to-text often lower-cases names: "sam" → "Sam". */
const titleCase = (s: string) =>
	s.trim().replace(/\p{L}+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));

function currencyOr(code: string | null | undefined, home: string): string {
	const upper = code?.toUpperCase();
	return upper && KNOWN.has(upper) ? upper : home;
}

/** Uses what this person taught Spendid: their name for the shop and its category. */
async function applyLearned(
	merchants: MerchantMemory | undefined,
	userId: string,
	drafts: VoiceDraft[],
): Promise<VoiceDraft[]> {
	if (!merchants) return drafts;
	return Promise.all(
		drafts.map(async (d) => {
			const known = d.merchant
				? await merchants.find(userId, d.merchant)
				: null;
			return known
				? {
						...d,
						merchant: known.name,
						categoryId: known.categoryId ?? d.categoryId,
					}
				: d;
		}),
	);
}

/** Voice note → reviewed drafts. Nothing heard is stored; only counts reach the ledger. */
export function createVoiceService(deps: Deps) {
	async function context(userId: string) {
		const [p] = await deps.db
			.select()
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		const categories = await deps.categories.listFor(userId);
		const bySlug = new Map(categories.map((c) => [c.slug, c]));
		return {
			home: p?.homeCurrency ?? "MYR",
			language: p?.locale === "ms" ? "ms" : "en",
			today: localToday(p?.timeZone ?? "UTC"),
			bySlug,
		};
	}

	function fromAi(
		e: SpokenExpense,
		home: string,
		bySlug: Map<string, Category>,
	): VoiceDraft | null {
		const currency = currencyOr(e.currency, home);
		const paid =
			e.yourShare && e.yourShare > 0 && e.yourShare <= e.amount
				? e.yourShare
				: e.amount;
		const amountMinor = toMinor(paid, currency);
		if (amountMinor <= 0) return null;
		return {
			amountMinor,
			currency,
			merchant: capitalise(e.description.trim()),
			categoryId: (bySlug.get(e.category) ?? bySlug.get("other"))?.id ?? null,
			daysAgo: clampDays(e.daysAgo),
			note: e.splitWith
				? `Split with ${titleCase(e.splitWith)}. Whole bill ${formatMinor(toMinor(e.amount, currency), currency)}.`
				: null,
		};
	}

	function fromQuick(
		q: QuickEntry,
		home: string,
		bySlug: Map<string, Category>,
	): VoiceDraft {
		const currency = currencyOr(q.currency, home);
		return {
			amountMinor: toMinor(q.amount ?? 0, currency),
			currency,
			merchant: q.description,
			categoryId:
				(bySlug.get(q.categorySlug ?? "other") ?? bySlug.get("other"))?.id ??
				null,
			daysAgo: q.daysAgo,
			note: null,
		};
	}

	return {
		async read(
			userId: string,
			audio: Buffer,
			mime: string,
			log: FastifyBaseLogger,
			earlier?: string,
		): Promise<VoiceResult> {
			const { home, language, bySlug, today } = await context(userId);
			await deps.guard.assertAllowed(userId);

			const started = performance.now();
			const heard = await deps.transcriber.transcribe(audio, {
				mime,
				language,
			});
			const listenMs = Math.round(performance.now() - started);
			await deps.guard.record(userId, {
				feature: "voice-listen",
				model: deps.asrModel,
				audioSeconds: heard.seconds,
			});
			if (!heard.text)
				throw new AppError(
					422,
					"We didn't catch any words. Try again a little closer to the mic.",
				);

			// No amount anywhere ("Hi.", small talk): nothing to log, so no AI call. The app
			// carries such a phrase into the next one as context.
			if (!hasSpokenAmount(heard.text))
				return { transcript: heard.text, drafts: [], readBy: "ai" };
			const digits = wordsToDigits(heard.text);
			try {
				const result = await deps.extract(digits, home, earlier, today.label);
				log.info(
					{
						listenMs,
						understandMs: Math.round(performance.now() - started) - listenMs,
					},
					"voice note read",
				);
				await deps.guard.record(userId, {
					feature: "voice-understand",
					model: result.model,
					inputTokens: result.inputTokens,
					outputTokens: result.outputTokens,
				});
				const drafts = result.expenses
					.map((e) => fromAi(e, home, bySlug))
					.filter((d): d is VoiceDraft => d !== null);
				return {
					transcript: heard.text,
					drafts: await applyLearned(deps.merchants, userId, drafts),
					readBy: "ai",
				};
			} catch (error) {
				if (error instanceof UnreadableAiAnswer)
					await deps.guard.record(userId, {
						feature: "voice-understand",
						...error.usage,
					});
				// The note was heard; reading it offline still beats an error.
				log.warn({ err: error }, "expense extraction failed; using quick read");
				const drafts = quickReadSpoken(digits, today.date).map((q) =>
					fromQuick(q, home, bySlug),
				);
				return {
					transcript: heard.text,
					drafts: await applyLearned(deps.merchants, userId, drafts),
					readBy: "quick",
				};
			}
		},
	};
}

export type VoiceService = ReturnType<typeof createVoiceService>;
