import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const exportStatus = pgEnum("export_status", [
	"building",
	"ready",
	"failed",
]);

/** A "download everything" archive: encrypted at rest, downloadable by its owner for 24 hours. */
export const dataExport = pgTable(
	"data_export",
	{
		id: uuid().primaryKey().default(sql`uuidv7()`),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: exportStatus().notNull().default("building"),
		fileKey: text(),
		bytes: integer(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [index("data_export_user_idx").on(t.userId, t.createdAt)],
);
