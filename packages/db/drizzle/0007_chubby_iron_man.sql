CREATE TYPE "public"."check_in_kind" AS ENUM('all-logged', 'nothing');--> statement-breakpoint
CREATE TYPE "public"."wish_decision" AS ENUM('bought', 'skipped');--> statement-breakpoint
CREATE TABLE "check_in" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"kind" "check_in_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_in_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "wish" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"link" text,
	"cool_until" timestamp with time zone NOT NULL,
	"decision" "wish_decision",
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish" ADD CONSTRAINT "wish_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wish_user_idx" ON "wish" USING btree ("user_id","created_at");