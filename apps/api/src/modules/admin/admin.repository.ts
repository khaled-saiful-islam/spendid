import {
	aiLimit,
	aiUsage,
	auditLog,
	type Db,
	emailLog,
	session,
	user,
} from "@spendid/db";
import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";

/*
 * Admin reads. Allowed tables: accounts, sessions, AI usage counts, email delivery log,
 * audit log. Money tables (transactions, receipts, budgets, goals, items, warranties)
 * are deliberately unreachable from here — admin.boundary.test.ts enforces it.
 */

const startOfUtcMonth = () => {
	const n = new Date();
	return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
};
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface AdminUser {
	id: string;
	name: string;
	email: string;
	username: string | null;
	role: string;
	emailVerified: boolean;
	banned: boolean;
	banReason: string | null;
	createdAt: string;
	lastActiveAt: string | null;
	ai: { usedTokens: number; limitTokens: number | null; enabled: boolean };
}

export function createAdminRepository(db: Db) {
	return {
		async overview() {
			const month = startOfUtcMonth();
			const today = new Date(new Date().toISOString().slice(0, 10));
			const [people] = await db
				.select({
					total: sql<number>`count(*)::int`,
					banned: sql<number>`count(*) filter (where ${user.banned})::int`,
					newThisWeek: sql<number>`count(*) filter (where ${user.createdAt} >= ${daysAgo(7).toISOString()}::timestamptz)::int`,
				})
				.from(user)
				.where(eq(user.role, "user"));
			const [active] = await db
				.select({ week: sql<number>`count(distinct ${session.userId})::int` })
				.from(session)
				.innerJoin(user, eq(user.id, session.userId))
				.where(and(gte(session.updatedAt, daysAgo(7)), eq(user.role, "user")));
			const [tokens] = await db
				.select({
					month: sql<string>`coalesce(sum(${aiUsage.billedTokens}), 0)`,
					today: sql<string>`coalesce(sum(${aiUsage.billedTokens}) filter (where ${aiUsage.createdAt} >= ${today.toISOString()}::timestamptz), 0)`,
					callsToday: sql<number>`count(*) filter (where ${aiUsage.createdAt} >= ${today.toISOString()}::timestamptz)::int`,
				})
				.from(aiUsage)
				.where(gte(aiUsage.createdAt, month));
			const byFeature = await db
				.select({
					feature: aiUsage.feature,
					tokens: sql<string>`sum(${aiUsage.billedTokens})`,
					calls: sql<number>`count(*)::int`,
				})
				.from(aiUsage)
				.where(gte(aiUsage.createdAt, month))
				.groupBy(aiUsage.feature);
			const day = sql<string>`to_char(${aiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
			const daily = await db
				.select({ day, tokens: sql<string>`sum(${aiUsage.billedTokens})` })
				.from(aiUsage)
				.where(gte(aiUsage.createdAt, daysAgo(29)))
				.groupBy(day)
				.orderBy(day);
			const emails = await db
				.select({
					type: emailLog.type,
					status: emailLog.status,
					count: sql<number>`count(*)::int`,
				})
				.from(emailLog)
				.where(gte(emailLog.createdAt, daysAgo(30)))
				.groupBy(emailLog.type, emailLog.status);
			return {
				people: {
					total: people?.total ?? 0,
					banned: people?.banned ?? 0,
					newThisWeek: people?.newThisWeek ?? 0,
					activeThisWeek: active?.week ?? 0,
				},
				ai: {
					tokensMonth: Number(tokens?.month ?? 0),
					tokensToday: Number(tokens?.today ?? 0),
					callsToday: tokens?.callsToday ?? 0,
					byFeature: byFeature
						.map((f) => ({
							feature: f.feature,
							tokens: Number(f.tokens),
							calls: f.calls,
						}))
						.sort((a, b) => b.tokens - a.tokens),
					daily: daily.map((d) => ({ day: d.day, tokens: Number(d.tokens) })),
				},
				email: emails,
			};
		},

		async listUsers(opts: {
			q?: string;
			before?: string;
			limit: number;
		}): Promise<{ items: AdminUser[]; nextBefore: string | null }> {
			const month = startOfUtcMonth();
			const filters = [];
			if (opts.q) {
				const term = `%${escapeLike(opts.q)}%`;
				filters.push(
					or(
						ilike(user.name, term),
						ilike(user.email, term),
						ilike(user.username, term),
					),
				);
			}
			if (opts.before) filters.push(lt(user.createdAt, new Date(opts.before)));
			const lastActive = db
				.select({
					userId: session.userId,
					at: sql<Date>`max(${session.updatedAt})`.as("at"),
				})
				.from(session)
				.groupBy(session.userId)
				.as("last_active");
			const used = db
				.select({
					userId: aiUsage.userId,
					tokens: sql<string>`sum(${aiUsage.billedTokens})`.as("tokens"),
				})
				.from(aiUsage)
				.where(gte(aiUsage.createdAt, month))
				.groupBy(aiUsage.userId)
				.as("used");
			const rows = await db
				.select({
					user,
					lastActive: lastActive.at,
					used: used.tokens,
					limit: aiLimit,
				})
				.from(user)
				.leftJoin(lastActive, eq(lastActive.userId, user.id))
				.leftJoin(used, eq(used.userId, user.id))
				.leftJoin(aiLimit, eq(aiLimit.userId, user.id))
				.where(filters.length ? and(...filters) : undefined)
				.orderBy(desc(user.createdAt))
				.limit(opts.limit + 1);
			const page = rows.slice(0, opts.limit);
			return {
				items: page.map((r) => ({
					id: r.user.id,
					name: r.user.name,
					email: r.user.email,
					username: r.user.username,
					role: r.user.role,
					emailVerified: r.user.emailVerified,
					banned: r.user.banned,
					banReason: r.user.banReason,
					createdAt: r.user.createdAt.toISOString(),
					lastActiveAt: r.lastActive
						? new Date(r.lastActive).toISOString()
						: null,
					ai: {
						usedTokens: Number(r.used ?? 0),
						limitTokens: r.limit?.monthlyTokens ?? null,
						enabled: r.limit?.enabled ?? true,
					},
				})),
				nextBefore:
					rows.length > opts.limit
						? (page.at(-1)?.user.createdAt.toISOString() ?? null)
						: null,
			};
		},

		async findUser(id: string) {
			const [row] = await db
				.select()
				.from(user)
				.where(eq(user.id, id))
				.limit(1);
			return row ?? null;
		},

		async setAiLimit(
			userId: string,
			monthlyTokens: number | null,
			enabled: boolean,
		): Promise<void> {
			await db
				.insert(aiLimit)
				.values({ userId, monthlyTokens, enabled })
				.onConflictDoUpdate({
					target: aiLimit.userId,
					set: { monthlyTokens, enabled },
				});
		},

		async audit(entry: {
			actorId: string;
			action: string;
			targetUserId?: string | null;
			targetLabel?: string | null;
			detail?: unknown;
		}) {
			await db.insert(auditLog).values({
				actorId: entry.actorId,
				action: entry.action,
				targetUserId: entry.targetUserId ?? null,
				targetLabel: entry.targetLabel ?? null,
				detail: entry.detail ?? null,
			});
		},

		async auditTrail(limit = 50) {
			const actor = db
				.select({ id: user.id, name: user.name })
				.from(user)
				.as("actor");
			return db
				.select({
					id: auditLog.id,
					action: auditLog.action,
					targetLabel: auditLog.targetLabel,
					detail: auditLog.detail,
					createdAt: auditLog.createdAt,
					actorName: actor.name,
				})
				.from(auditLog)
				.leftJoin(actor, eq(actor.id, auditLog.actorId))
				.orderBy(desc(auditLog.createdAt))
				.limit(limit);
		},
	};
}

export type AdminRepository = ReturnType<typeof createAdminRepository>;
