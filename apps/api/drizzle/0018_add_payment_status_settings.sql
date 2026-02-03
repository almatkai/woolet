ALTER TABLE "user_settings"
    ADD COLUMN IF NOT EXISTS "payment_status_logic" text DEFAULT 'monthly' NOT NULL,
    ADD COLUMN IF NOT EXISTS "payment_status_period" text DEFAULT '15' NOT NULL,
    ADD COLUMN IF NOT EXISTS "credit_status_logic" text,
    ADD COLUMN IF NOT EXISTS "credit_status_period" text,
    ADD COLUMN IF NOT EXISTS "subscription_status_logic" text,
    ADD COLUMN IF NOT EXISTS "subscription_status_period" text;

ALTER TABLE "user_settings"
    ALTER COLUMN "mortgage_status_logic" DROP NOT NULL,
    ALTER COLUMN "mortgage_status_period" DROP NOT NULL;

UPDATE "user_settings"
SET
    "payment_status_logic" = COALESCE("payment_status_logic", "mortgage_status_logic", 'monthly'),
    "payment_status_period" = COALESCE("payment_status_period", "mortgage_status_period", '15')
WHERE "payment_status_logic" IS NULL OR "payment_status_period" IS NULL;
