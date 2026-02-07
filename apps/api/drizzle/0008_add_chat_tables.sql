CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "amount" numeric(12, 2) NOT NULL,
    "currency" text DEFAULT 'USD' NOT NULL,
    "frequency" text DEFAULT 'monthly' NOT NULL,
    "billing_day" integer DEFAULT 1,
    "start_date" date NOT NULL,
    "end_date" date,
    "status" text DEFAULT 'active' NOT NULL,
    "icon" text DEFAULT '📱',
    "color" text DEFAULT '#6366f1',
    "description" text,
    "linked_entity_id" uuid,
    "linked_entity_type" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "subscription_id" uuid NOT NULL,
    "currency_balance_id" uuid,
    "amount" numeric(12, 2) NOT NULL,
    "paid_at" timestamp DEFAULT now() NOT NULL,
    "due_date" timestamp,
    "transaction_id" uuid,
    "note" text,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "session_id" uuid NOT NULL,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "user_id" text NOT NULL,
    "title" text DEFAULT 'New Chat' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb;
--> statement-breakpoint
ALTER TABLE "categories"
ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'income' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stocks"
ADD COLUMN IF NOT EXISTS "is_manual" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_currency_balance_id_currency_balances_id_fk" FOREIGN KEY ("currency_balance_id") REFERENCES "public"."currency_balances"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_type_idx" ON "subscriptions" USING btree ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_payments_paid_at_idx" ON "subscription_payments" USING btree ("paid_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_payments_currency_balance_id_idx" ON "subscription_payments" USING btree ("currency_balance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN IF EXISTS "is_default";