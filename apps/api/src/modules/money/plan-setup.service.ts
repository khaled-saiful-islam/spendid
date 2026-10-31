import { type Db, payCycle, profile } from "@spendid/db";
import {
	type CycleRange,
	checkCycle,
	type PlanPreview,
	type PlanSetup,
	PlanSetupInputSchema,
} from "@spendid/shared";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { AppError, notFound } from "../../http/app-error";
import { fieldError } from "../../http/field-error";
import { calendarMonth, cycleBounds, localDay, periodBounds } from "./period";
import type { SummaryService } from "./summary.service";

/** A stand-in id for a cycle that is only being previewed, never saved. */
const PREVIEW_ID = "00000000-0000-7000-8000-000000000000";

/** The "Your plan" sheet: period, cycle, salary and style, saved together. */
export function createPlanSetupService(db: Db, summary: SummaryService) {
	async function get(userId: string): Promise<PlanSetup> {
		const bounds = await periodBounds(db, userId);
		const [p] = await db
			.select({ method: profile.budgetMethod })
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		if (!p) throw notFound("Profile");
		return {
			period: bounds.kind,
			cycle:
				bounds.cycleId && bounds.status
					? {
							id: bounds.cycleId,
							startsOn: bounds.start,
							endsOn: bounds.end,
							status: bounds.status,
						}
					: null,
			incomeMinor: bounds.incomeMinor,
			method: p.method,
			today: bounds.today,
		};
	}

	/** The cycle before `current` (editing it), or the latest cycle (a new run). */
	async function previousOf(
		tx: Db,
		userId: string,
		current: { startsOn: string } | null,
	): Promise<CycleRange | null> {
		const [row] = await tx
			.select({ startsOn: payCycle.startsOn, endsOn: payCycle.endsOn })
			.from(payCycle)
			.where(
				and(
					eq(payCycle.userId, userId),
					current ? lt(payCycle.startsOn, current.startsOn) : undefined,
				),
			)
			.orderBy(desc(payCycle.startsOn))
			.limit(1);
		return row ?? null;
	}

	async function save(userId: string, raw: unknown): Promise<PlanSetup> {
		const input = PlanSetupInputSchema.parse(raw);
		// Drafts a missing current cycle first, so editing always finds it.
		await periodBounds(db, userId);
		await db.transaction(async (txRaw) => {
			const tx = txRaw as unknown as Db;
			const [p] = await tx
				.select()
				.from(profile)
				.where(eq(profile.userId, userId))
				.for("update");
			if (!p) throw notFound("Profile");
			const today = localDay(p.timeZone);

			if (input.period === "month") {
				// The current cycle (and any draft) ends here; finished cycles stay as history.
				await tx
					.delete(payCycle)
					.where(and(eq(payCycle.userId, userId), gte(payCycle.endsOn, today)));
				await tx
					.update(profile)
					.set({
						period: "month",
						monthlyIncomeMinor: input.incomeMinor,
						budgetMethod: input.method,
					})
					.where(eq(profile.userId, userId));
				return;
			}

			const range = input.cycle as CycleRange;
			const [current] =
				p.period === "cycle"
					? await tx
							.select({ id: payCycle.id, startsOn: payCycle.startsOn })
							.from(payCycle)
							.where(
								and(eq(payCycle.userId, userId), gte(payCycle.endsOn, today)),
							)
							.orderBy(desc(payCycle.startsOn))
							.limit(1)
					: [];
			const previous = await previousOf(tx, userId, current ?? null);
			const check = checkCycle({
				range,
				today,
				previous,
				joinPrevious: Boolean(current),
			});
			if (!check.ok) throw fieldError(`cycle.${check.field}`, check.message);

			if (previous && check.previousEndsOn)
				await tx
					.update(payCycle)
					.set({ endsOn: check.previousEndsOn })
					.where(
						and(
							eq(payCycle.userId, userId),
							eq(payCycle.startsOn, previous.startsOn),
						),
					);
			const values = {
				startsOn: range.startsOn,
				endsOn: range.endsOn,
				incomeMinor: input.incomeMinor,
				status: "set" as const,
			};
			if (current)
				await tx
					.update(payCycle)
					.set(values)
					.where(eq(payCycle.id, current.id));
			else await tx.insert(payCycle).values({ userId, ...values });
			await tx
				.update(profile)
				// The profile's income follows, so setup and Me show the same salary.
				.set({
					period: "cycle",
					budgetMethod: input.method,
					monthlyIncomeMinor: input.incomeMinor,
				})
				.where(eq(profile.userId, userId));
		});
		return get(userId);
	}

	async function confirm(userId: string): Promise<PlanSetup> {
		const bounds = await periodBounds(db, userId);
		if (bounds.status !== "draft" || !bounds.cycleId)
			throw new AppError(409, "There's no new cycle to confirm.");
		await db
			.update(payCycle)
			.set({ status: "set" })
			.where(and(eq(payCycle.id, bounds.cycleId), eq(payCycle.userId, userId)));
		return get(userId);
	}

	/** The daily amount a setup would give, worked out like Home, without saving anything. */
	async function preview(userId: string, raw: unknown): Promise<PlanPreview> {
		const input = PlanSetupInputSchema.parse(raw);
		const [p] = await db
			.select({ timeZone: profile.timeZone })
			.from(profile)
			.where(eq(profile.userId, userId))
			.limit(1);
		const today = localDay(p?.timeZone ?? "UTC");
		let bounds = calendarMonth(today, input.incomeMinor);
		if (input.period === "cycle") {
			const range = input.cycle as CycleRange;
			const check = checkCycle({
				range,
				today,
				previous: null,
				joinPrevious: false,
			});
			if (!check.ok) throw fieldError(`cycle.${check.field}`, check.message);
			bounds = cycleBounds(today, {
				id: PREVIEW_ID,
				...range,
				incomeMinor: input.incomeMinor,
				status: "set",
			});
		}
		const s = await summary.forBounds(userId, bounds, input.method);
		return {
			status: s.safe.status,
			dailyAllowanceMinor: s.safe.dailyAllowanceMinor,
			days: bounds.days,
			daysLeft: bounds.daysLeft,
		};
	}

	return { get, save, confirm, preview };
}

export type PlanSetupService = ReturnType<typeof createPlanSetupService>;
