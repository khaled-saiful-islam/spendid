CREATE TYPE "public"."cycle_status" AS ENUM('set', 'draft');--> statement-breakpoint
CREATE TYPE "public"."period_kind" AS ENUM('month', 'cycle');--> statement-breakpoint
CREATE TABLE "pay_cycle" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"income_minor" bigint NOT NULL,
	"status" "cycle_status" DEFAULT 'set' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_cycle_length" CHECK ("pay_cycle"."ends_on" between "pay_cycle"."starts_on" + 6 and "pay_cycle"."starts_on" + 61),
	CONSTRAINT "pay_cycle_income_not_negative" CHECK ("pay_cycle"."income_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "period" "period_kind" DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_cycle" ADD CONSTRAINT "pay_cycle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pay_cycle_user_idx" ON "pay_cycle" USING btree ("user_id","starts_on");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "pay_cycle" ADD CONSTRAINT "pay_cycle_no_overlap" EXCLUDE USING gist ("user_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&) DEFERRABLE INITIALLY DEFERRED;
