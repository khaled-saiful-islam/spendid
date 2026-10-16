CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "known_device" (
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"label" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "known_device_user_id_fingerprint_pk" PRIMARY KEY("user_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "merchant" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"embedding" vector(1024),
	"uses" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_pref" (
	"user_id" text PRIMARY KEY NOT NULL,
	"weekly" boolean DEFAULT true NOT NULL,
	"budget" boolean DEFAULT true NOT NULL,
	"unusual" boolean DEFAULT true NOT NULL,
	"bills" boolean DEFAULT true NOT NULL,
	"warranty" boolean DEFAULT true NOT NULL,
	"goals" boolean DEFAULT true NOT NULL,
	"wrapped" boolean DEFAULT true NOT NULL,
	"family" boolean DEFAULT true NOT NULL,
	"product" boolean DEFAULT true NOT NULL,
	"hide_amounts" boolean DEFAULT false NOT NULL,
	"quiet_start" smallint DEFAULT 22 NOT NULL,
	"quiet_end" smallint DEFAULT 8 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "known_device" ADD CONSTRAINT "known_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant" ADD CONSTRAINT "merchant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant" ADD CONSTRAINT "merchant_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_user_key_idx" ON "merchant" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "merchant_embedding_idx" ON "merchant" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "notification_once_idx" ON "notification_log" USING btree ("user_id","kind","dedupe_key");