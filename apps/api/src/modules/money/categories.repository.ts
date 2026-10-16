import { category, type Db } from "@spendid/db";
import type { Category } from "@spendid/shared";
import { and, asc, eq, isNull, or } from "drizzle-orm";

export interface CategoryRepository {
	listFor(userId: string): Promise<Category[]>;
	isVisibleTo(userId: string, categoryId: string): Promise<boolean>;
}

const visibleTo = (userId: string) =>
	or(isNull(category.userId), eq(category.userId, userId));

export function createCategoryRepository(db: Db): CategoryRepository {
	return {
		async listFor(userId) {
			return db
				.select({
					id: category.id,
					slug: category.slug,
					name: category.name,
					icon: category.icon,
					tint: category.tint,
					kind: category.kind,
				})
				.from(category)
				.where(visibleTo(userId))
				.orderBy(asc(category.sort), asc(category.name));
		},
		async isVisibleTo(userId, categoryId) {
			const [row] = await db
				.select({ id: category.id })
				.from(category)
				.where(and(eq(category.id, categoryId), visibleTo(userId)))
				.limit(1);
			return Boolean(row);
		},
	};
}
