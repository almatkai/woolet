CREATE TYPE "public"."contact_type" AS ENUM('telegram', 'whatsapp', 'phone', 'email', 'other');--> statement-breakpoint
CREATE TYPE "public"."split_status" AS ENUM('pending', 'partial', 'settled');--> statement-breakpoint
CREATE TABLE "split_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_type" "contact_type",
	"contact_value" text,
	"color" text DEFAULT '#8b5cf6',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"received_to_currency_balance_id" uuid,
	"linked_transaction_id" uuid,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"owed_amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "split_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "split_participants" ADD CONSTRAINT "split_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_split_id_transaction_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."transaction_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_received_to_currency_balance_id_currency_balances_id_fk" FOREIGN KEY ("received_to_currency_balance_id") REFERENCES "public"."currency_balances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_participant_id_split_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."split_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_participants_user_id_idx" ON "split_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "split_payments_split_id_idx" ON "split_payments" USING btree ("split_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_transaction_id_idx" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_participant_id_idx" ON "transaction_splits" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_status_idx" ON "transaction_splits" USING btree ("status");