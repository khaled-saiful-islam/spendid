CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "email_log_user_idx" ON "email_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "connection_requester_idx" ON "connection" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "family_invite_accepted_idx" ON "family_invite" USING btree ("accepted_by");--> statement-breakpoint
CREATE INDEX "goal_deposit_user_idx" ON "goal_deposit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merchant_category_idx" ON "merchant" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "budget_category_idx" ON "budget" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "category_user_idx" ON "category" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_category_idx" ON "transaction" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "receipt_transaction_idx" ON "receipt" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "warranty_transaction_idx" ON "warranty" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "subscription_category_idx" ON "subscription" USING btree ("category_id");