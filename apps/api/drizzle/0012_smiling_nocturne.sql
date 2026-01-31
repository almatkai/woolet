CREATE TABLE "investment_cash_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"currency" text NOT NULL,
	"available_balance" numeric(20, 2) DEFAULT '0' NOT NULL,
	"settled_balance" numeric(20, 2) DEFAULT '0' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD COLUMN "cash_flow" numeric(20, 8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD COLUMN "cash_balance_after" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "investment_cash_balances" ADD CONSTRAINT "investment_cash_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;