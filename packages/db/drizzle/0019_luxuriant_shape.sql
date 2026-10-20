ALTER TYPE "public"."budget_method" ADD VALUE 'pay_yourself_first';--> statement-breakpoint
CREATE TABLE "monthly_transfer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_transfer_amount_positive" CHECK ("monthly_transfer"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "monthly_transfer" ADD CONSTRAINT "monthly_transfer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_transfer_user_idx" ON "monthly_transfer" USING btree ("user_id");