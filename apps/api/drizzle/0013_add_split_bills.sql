-- Create enum types
DO $$ BEGIN
    CREATE TYPE contact_type AS ENUM ('telegram', 'whatsapp', 'phone', 'email', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE split_status AS ENUM ('pending', 'partial', 'settled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Split Participants table
-- Stores contacts/people that a user can tag on transactions for bill splitting
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
);

CREATE INDEX IF NOT EXISTS split_participants_user_id_idx ON split_participants(user_id);

-- Transaction Splits table
-- Links transactions with participants who owe money (bill splitting)
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
);

CREATE INDEX IF NOT EXISTS transaction_splits_transaction_id_idx ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS transaction_splits_participant_id_idx ON transaction_splits(participant_id);
CREATE INDEX IF NOT EXISTS transaction_splits_status_idx ON transaction_splits(status);

-- Split Payments table
-- Records when someone pays back their share of a split
CREATE TABLE IF NOT EXISTS split_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_id UUID NOT NULL REFERENCES transaction_splits(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    received_to_currency_balance_id UUID REFERENCES currency_balances(id) ON DELETE SET NULL,
    linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS split_payments_split_id_idx ON split_payments(split_id);
