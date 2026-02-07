CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "user_id" text NOT NULL,
    "default_currency" text DEFAULT 'USD' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "user_settings_user_id_unique" UNIQUE ("user_id")
);