-- Add mortgage_payments table for tracking monthly mortgage payments
CREATE TABLE IF NOT EXISTS "mortgage_payments" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "mortgage_id" uuid NOT NULL REFERENCES "mortgages"("id") ON DELETE CASCADE,
    "month_year" text NOT NULL,
    "amount" decimal(12, 2) NOT NULL,
    "paid_at" timestamp DEFAULT now() NOT NULL,
    "note" text
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "mortgage_payments_mortgage_id_idx" ON "mortgage_payments"("mortgage_id");
CREATE INDEX IF NOT EXISTS "mortgage_payments_month_year_idx" ON "mortgage_payments"("month_year");

-- Add new columns to mortgages table
ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "end_date" date;
ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "payment_day" integer DEFAULT 1;
