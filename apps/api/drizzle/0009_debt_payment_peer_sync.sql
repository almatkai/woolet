-- Linked debt repayments: wait for counterparty to confirm + choose their account
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "sync_status" text DEFAULT 'posted' NOT NULL;
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "proposed_by_user_id" text;
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "proposer_distributions" jsonb;
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "sync_group_id" uuid;
UPDATE "debt_payments" SET "sync_status" = 'posted' WHERE "sync_status" IS NULL;
