ALTER TABLE "split_participants"
    ADD COLUMN IF NOT EXISTS "linked_user_id" text,
    ADD COLUMN IF NOT EXISTS "linked_username" text;

DO $$
BEGIN
    ALTER TABLE "split_participants"
        ADD CONSTRAINT "split_participants_linked_user_id_users_id_fk"
            FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "split_participants_linked_user_id_idx"
    ON "split_participants" ("linked_user_id");
