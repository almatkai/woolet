ALTER TABLE "transactions" ADD COLUMN "debt_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "exclude_from_monthly_stats" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_payment_id_debt_payments_id_fk" FOREIGN KEY ("debt_payment_id") REFERENCES "public"."debt_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_debt_payment_id_idx" ON "transactions" USING btree ("debt_payment_id");