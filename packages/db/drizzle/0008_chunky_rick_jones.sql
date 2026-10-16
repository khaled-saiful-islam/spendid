CREATE TYPE "public"."export_status" AS ENUM('building', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "data_export" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"status" "export_status" DEFAULT 'building' NOT NULL,
	"file_key" text,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_export_user_idx" ON "data_export" USING btree ("user_id","created_at");