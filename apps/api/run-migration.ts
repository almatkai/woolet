import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString, { max: 1 });

async function runMigration() {
    try {
        console.log('Adding exclude_from_monthly_stats column...');

        // Only add the new column (debt_payment_id already exists)
        await sql`
            ALTER TABLE "transactions" 
            ADD COLUMN IF NOT EXISTS "exclude_from_monthly_stats" boolean DEFAULT false NOT NULL
        `;

        console.log('Ensuring mortgage payments table and columns...');

        await sql`
            CREATE TABLE IF NOT EXISTS "mortgage_payments" (
                "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                "mortgage_id" uuid NOT NULL REFERENCES "mortgages"("id") ON DELETE CASCADE,
                "month_year" text NOT NULL,
                "amount" decimal(12, 2) NOT NULL,
                "paid_at" timestamp DEFAULT now() NOT NULL,
                "note" text
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS "mortgage_payments_mortgage_id_idx" ON "mortgage_payments"("mortgage_id")`;
        await sql`CREATE INDEX IF NOT EXISTS "mortgage_payments_month_year_idx" ON "mortgage_payments"("month_year")`;

        await sql`ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "end_date" date`;
        await sql`ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "payment_day" integer DEFAULT 1`;

        console.log('Setting up split bills tables...');

        // Add missing investment transaction columns
        console.log('Adding cash_flow column to investment_transactions...');
        await sql`ALTER TABLE "investment_transactions" ADD COLUMN IF NOT EXISTS "cash_flow" numeric(20, 8) DEFAULT '0' NOT NULL`;
        
        console.log('Adding cash_balance_after column to investment_transactions...');
        await sql`ALTER TABLE "investment_transactions" ADD COLUMN IF NOT EXISTS "cash_balance_after" numeric(20, 2)`;

        // Create enum types
        await sql`
            DO $$ BEGIN
                CREATE TYPE contact_type AS ENUM ('telegram', 'whatsapp', 'phone', 'email', 'other');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `;

        await sql`
            DO $$ BEGIN
                CREATE TYPE split_status AS ENUM ('pending', 'partial', 'settled');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `;

        // Split Participants table
        await sql`
            CREATE TABLE IF NOT EXISTS split_participants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                contact_type contact_type,
                contact_value TEXT,
                color TEXT DEFAULT '#8b5cf6',
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS split_participants_user_id_idx ON split_participants(user_id)`;

        // Transaction Splits table
        await sql`
            CREATE TABLE IF NOT EXISTS transaction_splits (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
                participant_id UUID NOT NULL REFERENCES split_participants(id) ON DELETE CASCADE,
                owed_amount DECIMAL(12, 2) NOT NULL,
                paid_amount DECIMAL(12, 2) NOT NULL DEFAULT '0',
                status split_status NOT NULL DEFAULT 'pending',
                note TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS transaction_splits_transaction_id_idx ON transaction_splits(transaction_id)`;
        await sql`CREATE INDEX IF NOT EXISTS transaction_splits_participant_id_idx ON transaction_splits(participant_id)`;
        await sql`CREATE INDEX IF NOT EXISTS transaction_splits_status_idx ON transaction_splits(status)`;

        // Split Payments table
        await sql`
            CREATE TABLE IF NOT EXISTS split_payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                split_id UUID NOT NULL REFERENCES transaction_splits(id) ON DELETE CASCADE,
                amount DECIMAL(12, 2) NOT NULL,
                received_to_currency_balance_id UUID REFERENCES currency_balances(id) ON DELETE SET NULL,
                linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
                paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
                note TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `;

        await sql`CREATE INDEX IF NOT EXISTS split_payments_split_id_idx ON split_payments(split_id)`;

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

runMigration();
