ALTER TABLE "fx_rates" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "fx_rates_to_currency_date_idx" ON "fx_rates" USING btree ("to_currency","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fx_rates_created_at_idx" ON "fx_rates" USING btree ("created_at" DESC NULLS LAST);