ALTER TABLE "budget" ADD CONSTRAINT "budget_limit_not_negative" CHECK ("budget"."monthly_limit_minor" >= 0);--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_target_positive" CHECK ("goal"."target_minor" > 0);--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_saved_not_negative" CHECK ("goal"."saved_minor" >= 0);--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_amount_positive" CHECK ("transaction"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_home_amount_positive" CHECK ("transaction"."home_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_currency_code" CHECK ("transaction"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_home_currency_code" CHECK ("transaction"."home_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_currency_code" CHECK ("profile"."home_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_income_not_negative" CHECK ("profile"."monthly_income_minor" is null or "profile"."monthly_income_minor" >= 0);--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_amount_positive" CHECK ("subscription"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_currency_code" CHECK ("subscription"."currency" ~ '^[A-Z]{3}$');