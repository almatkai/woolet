CREATE TABLE "mortgage_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mortgage_id" uuid NOT NULL,
	"month_year" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "widget_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mortgages" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "mortgages" ADD COLUMN "payment_day" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "mortgage_payments" ADD CONSTRAINT "mortgage_payments_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mortgage_payments_mortgage_id_idx" ON "mortgage_payments" USING btree ("mortgage_id");--> statement-breakpoint
CREATE INDEX "mortgage_payments_month_year_idx" ON "mortgage_payments" USING btree ("month_year");