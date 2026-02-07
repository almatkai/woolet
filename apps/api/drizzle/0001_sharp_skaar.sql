CREATE TABLE IF NOT EXISTS "currencies" (
    "code" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "symbol" text NOT NULL,
    "decimal_places" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "banks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "icon" text,
    "color" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "currency_balances" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "account_id" uuid NOT NULL,
    "currency_code" text NOT NULL,
    "balance" numeric(14, 2) DEFAULT '0' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "currency_balances_account_currency_unique" UNIQUE ("account_id", "currency_code")
);
--> statement-breakpoint
ALTER TABLE "accounts"
DROP CONSTRAINT IF EXISTS "accounts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions"
DROP CONSTRAINT IF EXISTS "transactions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions"
DROP CONSTRAINT IF EXISTS "transactions_to_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "debts"
DROP CONSTRAINT "debts_account_id_accounts_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "accounts_user_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_account_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_account_date_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "debts_account_id_idx";
--> statement-breakpoint
ALTER TABLE "accounts"
ADD COLUMN IF NOT EXISTS "bank_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "currency_balance_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "cashback_amount" numeric(12, 2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "to_currency_balance_id" uuid;
--> statement-breakpoint
ALTER TABLE "debts"
ADD COLUMN IF NOT EXISTS "currency_balance_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "banks" ADD CONSTRAINT "banks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "currency_balances" ADD CONSTRAINT "currency_balances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "currency_balances" ADD CONSTRAINT "currency_balances_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "banks_user_id_idx" ON "banks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "currency_balances_account_id_idx" ON "currency_balances" USING btree ("account_id");
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_bank_id_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_balance_id_currency_balances_id_fk" FOREIGN KEY ("currency_balance_id") REFERENCES "public"."currency_balances"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_currency_balance_id_currency_balances_id_fk" FOREIGN KEY ("to_currency_balance_id") REFERENCES "public"."currency_balances"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_currency_balance_id_currency_balances_id_fk" FOREIGN KEY ("currency_balance_id") REFERENCES "public"."currency_balances"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_bank_id_idx" ON "accounts" USING btree ("bank_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_currency_balance_id_idx" ON "transactions" USING btree ("currency_balance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_currency_balance_id_idx" ON "debts" USING btree ("currency_balance_id");
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "user_id";
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "is_cash";
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "currency";
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "balance";
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "color";
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "is_archived";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "account_id";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "currency";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "to_account_id";
--> statement-breakpoint
ALTER TABLE "debts" DROP COLUMN IF EXISTS "account_id";
--> statement-breakpoint
ALTER TABLE "debts" DROP COLUMN IF EXISTS "currency";