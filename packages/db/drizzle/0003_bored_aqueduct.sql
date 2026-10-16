CREATE TYPE "public"."receipt_status" AS ENUM('reading', 'ready', 'failed', 'saved');--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"status" "receipt_status" DEFAULT 'reading' NOT NULL,
	"file_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"draft" jsonb,
	"error" text,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"name" text NOT NULL,
	"item_key" text NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"bought_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranty" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"purchased_on" date NOT NULL,
	"months" integer NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty" ADD CONSTRAINT "warranty_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty" ADD CONSTRAINT "warranty_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_user_status_idx" ON "receipt" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "item_user_key_time_idx" ON "transaction_item" USING btree ("user_id","item_key","bought_at");--> statement-breakpoint
CREATE INDEX "item_transaction_idx" ON "transaction_item" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "warranty_user_ends_idx" ON "warranty" USING btree ("user_id","ends_on");