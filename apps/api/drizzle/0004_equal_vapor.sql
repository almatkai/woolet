ALTER TABLE "banks" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint

DO $$
BEGIN
    UPDATE "debts"
    SET "user_id" = sub."user_id"
    FROM (
        SELECT cb.id as cb_id, b.user_id
        FROM "currency_balances" cb
        JOIN "accounts" a ON cb.account_id = a.id
        JOIN "banks" b ON a.bank_id = b.id
    ) AS sub
    WHERE "debts"."currency_balance_id" = sub.cb_id;
END $$;--> statement-breakpoint

ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debts_user_id_idx" ON "debts" USING btree ("user_id");