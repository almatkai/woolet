ALTER TABLE "transactions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE INDEX "transactions_idempotency_key_idx" ON "transactions" USING btree ("idempotency_key");