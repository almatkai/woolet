CREATE TABLE "market_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"digest_date" date NOT NULL,
	"kind" text DEFAULT 'daily' NOT NULL,
	"specs" text,
	"specs_hash" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_digests" ADD CONSTRAINT "market_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_digests_user_date_kind_idx" ON "market_digests" USING btree ("user_id","digest_date","kind");--> statement-breakpoint
CREATE INDEX "market_digests_user_date_specs_idx" ON "market_digests" USING btree ("user_id","digest_date","specs_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "market_digests_daily_unique_idx" ON "market_digests" USING btree ("user_id","digest_date","kind") WHERE kind = 'daily';