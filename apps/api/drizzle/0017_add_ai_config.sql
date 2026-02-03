-- Migration for AI configuration system
-- Add a table to store AI configuration settings

CREATE TABLE IF NOT EXISTS ai_config (
    id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
    provider_order JSONB NOT NULL,
    default_provider TEXT,
    model_settings JSONB NOT NULL,
    fallback_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default AI configuration
INSERT INTO ai_config (
    id,
    provider_order,
    default_provider,
    model_settings,
    fallback_enabled
) VALUES (
    'default',
    '["openrouter", "groq", "openai", "gemini"]',
    'openrouter',
    '{
        "openrouter": { "model": "openrouter/auto", "enabled": true },
        "openai": { "model": "gpt-4o-mini", "enabled": true },
        "groq": { "model": "llama-3.1-8b-instant", "enabled": true },
        "gemini": { "model": "gemini-1.5-flash", "enabled": true }
    }',
    true
) ON CONFLICT (id) DO NOTHING;

-- Create a function to update the updated_at column automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to update updated_at column
CREATE TRIGGER update_ai_config_updated_at
    BEFORE UPDATE ON ai_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
