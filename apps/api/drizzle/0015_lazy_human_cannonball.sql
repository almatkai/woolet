ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
DO $$ BEGIN
    CREATE INDEX "transactions_idempotency_key_idx" ON "transactions" USING btree ("idempotency_key");
EXCEPTION
    WHEN duplicate_table THEN null;
    WHEN duplicate_object THEN null;
END $$;