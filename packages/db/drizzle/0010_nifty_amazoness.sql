CREATE TYPE "public"."billing_cycle" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_varies" boolean DEFAULT false NOT NULL,
	"cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"next_due" date NOT NULL,
	"remind_days" integer DEFAULT 3 NOT NULL,
	"category_id" uuid NOT NULL,
	"note" text,
	"last_paid_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_user_due_idx" ON "subscription" USING btree ("user_id","next_due");