ALTER TABLE "debts"
    ADD COLUMN IF NOT EXISTS "linked_user_id" text;

DO $$
BEGIN
    ALTER TABLE "debts"
        ADD CONSTRAINT "debts_linked_user_id_users_id_fk"
            FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "debts_linked_user_id_idx"
    ON "debts" ("linked_user_id");
