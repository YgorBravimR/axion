CREATE INDEX "idx_trades_account_archived_date" ON "trades" USING btree ("account_id","is_archived","entry_date");--> statement-breakpoint
CREATE INDEX "idx_trades_account_archived_outcome" ON "trades" USING btree ("account_id","is_archived","outcome");--> statement-breakpoint
CREATE INDEX "idx_trades_active_date" ON "trades" USING btree ("account_id","entry_date") WHERE is_archived = false;