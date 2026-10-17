CREATE TABLE "challenge" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_minor" bigint,
	"start_day" date NOT NULL,
	"end_day" date NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_user_idx" ON "challenge" USING btree ("user_id","end_day");