CREATE TYPE "public"."category_kind" AS ENUM('need', 'want', 'saving');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('manual', 'voice', 'photo', 'chat');--> statement-breakpoint
CREATE TABLE "budget" (
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"monthly_limit_minor" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_user_id_category_id_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"tint" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"sort" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"day" date NOT NULL,
	"currency" char(3) NOT NULL,
	"per_eur" numeric(20, 10) NOT NULL,
	CONSTRAINT "fx_rate_day_currency_pk" PRIMARY KEY("day","currency")
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🎯' NOT NULL,
	"target_minor" bigint NOT NULL,
	"saved_minor" bigint DEFAULT 0 NOT NULL,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"home_amount_minor" bigint NOT NULL,
	"home_currency" char(3) NOT NULL,
	"fx_rate" numeric(20, 10) DEFAULT '1' NOT NULL,
	"category_id" uuid NOT NULL,
	"merchant" text,
	"note" text,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_owner_slug_idx" ON "category" USING btree (coalesce("user_id", ''),"slug");--> statement-breakpoint
CREATE INDEX "goal_user_idx" ON "goal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_user_time_idx" ON "transaction" USING btree ("user_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transaction_user_category_idx" ON "transaction" USING btree ("user_id","category_id");