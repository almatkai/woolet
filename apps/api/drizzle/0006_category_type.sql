ALTER TABLE "categories"
ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'income';