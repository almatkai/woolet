CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "email" text NOT NULL,
    "name" text,
    "default_currency" text DEFAULT 'USD' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "is_cash" boolean DEFAULT false NOT NULL,
    "currency" text NOT NULL,
    "balance" numeric(14, 2) DEFAULT '0' NOT NULL,
    "icon" text,
    "color" text,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "user_id" text,
    "name" text NOT NULL,
    "icon" text NOT NULL,
    "color" text NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "account_id" uuid NOT NULL,
    "category_id" uuid NOT NULL,
    "amount" numeric(12, 2) NOT NULL,
    "fee" numeric(12, 2) DEFAULT '0' NOT NULL,
    "exchange_rate" numeric(12, 6) DEFAULT '1' NOT NULL,
    "to_amount" numeric(12, 2),
    "currency" text NOT NULL,
    "description" text,
    "date" date NOT NULL,
    "type" text NOT NULL,
    "to_account_id" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debt_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "debt_id" uuid NOT NULL,
    "amount" numeric(12, 2) NOT NULL,
    "paid_at" timestamp DEFAULT now() NOT NULL,
    "note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "account_id" uuid NOT NULL,
    "person_name" text NOT NULL,
    "person_contact" text,
    "amount" numeric(12, 2) NOT NULL,
    "paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
    "currency" text NOT NULL,
    "type" text NOT NULL,
    "description" text,
    "due_date" date,
    "status" text DEFAULT 'pending' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credits" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "account_id" uuid NOT NULL,
    "name" text NOT NULL,
    "principal_amount" numeric(12, 2) NOT NULL,
    "interest_rate" numeric(5, 2) NOT NULL,
    "monthly_payment" numeric(12, 2) NOT NULL,
    "remaining_balance" numeric(12, 2) NOT NULL,
    "currency" text NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deposits" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "account_id" uuid NOT NULL,
    "bank_name" text NOT NULL,
    "deposit_name" text NOT NULL,
    "principal_amount" numeric(14, 2) NOT NULL,
    "current_balance" numeric(14, 2) NOT NULL,
    "interest_rate" numeric(5, 2) NOT NULL,
    "compounding_frequency" text DEFAULT 'monthly' NOT NULL,
    "currency" text NOT NULL,
    "start_date" date NOT NULL,
    "maturity_date" date,
    "is_flexible" boolean DEFAULT true NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mortgages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "account_id" uuid NOT NULL,
    "property_name" text NOT NULL,
    "property_address" text,
    "principal_amount" numeric(14, 2) NOT NULL,
    "interest_rate" numeric(5, 2) NOT NULL,
    "monthly_payment" numeric(12, 2) NOT NULL,
    "remaining_balance" numeric(14, 2) NOT NULL,
    "currency" text NOT NULL,
    "start_date" date NOT NULL,
    "term_years" integer NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_account_id_idx" ON "transactions" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_date_idx" ON "transactions" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_account_date_idx" ON "transactions" USING btree ("account_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_account_id_idx" ON "debts" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_status_idx" ON "debts" USING btree ("status");