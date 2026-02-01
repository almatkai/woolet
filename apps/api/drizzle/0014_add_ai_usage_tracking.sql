-- Migration: Create AI usage tracking table
-- Run this after the subscription_tier migration

CREATE TABLE ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_count_today INTEGER DEFAULT 0 NOT NULL,
    question_count_lifetime INTEGER DEFAULT 0 NOT NULL,
    last_reset_date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(user_id)
);

CREATE INDEX ai_usage_user_id_idx ON ai_usage(user_id);
CREATE INDEX ai_usage_last_reset_idx ON ai_usage(last_reset_date);

-- Function to check and reset daily counter
CREATE OR REPLACE FUNCTION check_and_reset_ai_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- If last reset was before today, reset daily counter
    IF NEW.last_reset_date < CURRENT_DATE THEN
        NEW.question_count_today := 0;
        NEW.last_reset_date := CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_usage_reset_trigger
    BEFORE UPDATE ON ai_usage
    FOR EACH ROW
    EXECUTE FUNCTION check_and_reset_ai_usage();
