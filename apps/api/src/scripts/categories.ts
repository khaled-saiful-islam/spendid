import { category, type Db } from "@spendid/db";
import { SYSTEM_CATEGORIES } from "@spendid/shared";
import { and, eq, isNull } from "drizzle-orm";

/** Inserts missing system categories and refreshes names/icons of existing ones. */
export async function seedCategories(db: Db): Promise<void> {
	for (const [index, c] of SYSTEM_CATEGORIES.entries()) {
		const values = {
			name: c.name,
			icon: c.icon,
			tint: c.tint,
			kind: c.kind,
			sort: index,
		};
		const [existing] = await db
			.select({ id: category.id })
			.from(category)
			.where(and(isNull(category.userId), eq(category.slug, c.slug)))
			.limit(1);
		if (existing)
			await db.update(category).set(values).where(eq(category.id, existing.id));
		else await db.insert(category).values({ slug: c.slug, ...values });
	}
	process.stdout.write(`[seed] ${SYSTEM_CATEGORIES.length} categories ready\n`);
}
