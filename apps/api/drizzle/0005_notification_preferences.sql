ALTER TABLE "user_settings"
    ADD COLUMN IF NOT EXISTS "notifications_enabled" boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "browser_notifications_enabled" boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "email_notification_address" text,
    ADD COLUMN IF NOT EXISTS "subscription_reminder_days" integer NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS "credit_reminder_days" integer NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS "mortgage_reminder_days" integer NOT NULL DEFAULT 3;
