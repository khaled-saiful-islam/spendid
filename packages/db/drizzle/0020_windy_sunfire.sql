ALTER TABLE "profile" ALTER COLUMN "budget_method" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "budget_method" DROP NOT NULL;