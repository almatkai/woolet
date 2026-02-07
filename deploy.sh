#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# Set default values for environment variables
# Use woolet_app as default user as requested
DB_USER="${DB_USER:-woolet_app}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-woolet}"
POSTGRES_HOST="woolet-postgres"

# Construct a direct connection URL for setup and migrations
BUILD_DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${POSTGRES_HOST}:5432/${DB_NAME}"

# 2. Handle .env file
if [ -f .env ]; then
    echo "ℹ️ .env file already exists. Sourcing existing values..."
    # Source .env safely (handling comments and exports)
    export $(grep -v '^#' .env | xargs)
else
    echo "🏗️ Generating .env file..."
    # Function to escape $ to $$ for Docker Compose
    escape_env() {
        echo "${1//$/\$\$}"
    }

    {
        printf "DB_USER=%s\n" "$(escape_env "$DB_USER")"
        printf "DB_NAME=%s\n" "$(escape_env "$DB_NAME")"
        printf "DB_PASSWORD=%s\n" "$(escape_env "$DB_PASSWORD")"
        printf "GLITCHTIP_DB_PASSWORD=%s\n" "$(escape_env "$GLITCHTIP_DB_PASSWORD")"
        printf "GLITCHTIP_DOMAIN=%s\n" "$(escape_env "$GLITCHTIP_DOMAIN")"
        printf "GLITCHTIP_FROM_EMAIL=%s\n" "$(escape_env "$GLITCHTIP_FROM_EMAIL")"
        printf "GLITCHTIP_SECRET_KEY=%s\n" "$(escape_env "$GLITCHTIP_SECRET_KEY")"
        printf "REDIS_PASSWORD=%s\n" "$(escape_env "$REDIS_PASSWORD")"
        printf "CLERK_SECRET_KEY=%s\n" "$(escape_env "$CLERK_SECRET_KEY")"
        printf "CLERK_PUBLISHABLE_KEY=%s\n" "$(escape_env "$CLERK_PUBLISHABLE_KEY")"
        printf "VITE_CLERK_PUBLISHABLE_KEY=%s\n" "$(escape_env "$VITE_CLERK_PUBLISHABLE_KEY")"
        # Provide the default DATABASE_URL for the app (using PgBouncer) if not set in env
        printf "DATABASE_URL=%s\n" "$(escape_env "${DATABASE_URL:-postgresql://$DB_USER:$DB_PASSWORD@woolet-pgbouncer:5432/$DB_NAME}")"
        printf "REDIS_URL=%s\n" "$(escape_env "$REDIS_URL")"
        printf "WOOLET_API_IMAGE=%s\n" "$(escape_env "$WOOLET_API_IMAGE")"
        printf "WOOLET_WEB_IMAGE=%s\n" "$(escape_env "$WOOLET_WEB_IMAGE")"
        printf "WOOLET_LANDING_IMAGE=%s\n" "$(escape_env "$WOOLET_LANDING_IMAGE")"
        printf "NODE_ENV=%s\n" "$(escape_env "$NODE_ENV")"
        printf "API_URL=%s\n" "$(escape_env "$API_URL")"
        printf "WEB_URL=%s\n" "$(escape_env "$WEB_URL")"
        printf "GLITCHTIP_DSN_API=%s\n" "$(escape_env "$GLITCHTIP_DSN_API")"
        printf "VITE_GLITCHTIP_DSN_WEB=%s\n" "$(escape_env "$VITE_GLITCHTIP_DSN_WEB")"
        printf "VITE_PUBLIC_POSTHOG_KEY=%s\n" "$(escape_env "$VITE_PUBLIC_POSTHOG_KEY")"
        printf "VITE_PUBLIC_POSTHOG_HOST=%s\n" "$(escape_env "$VITE_PUBLIC_POSTHOG_HOST")"
        printf "LOG_LEVEL=%s\n" "$(escape_env "$LOG_LEVEL")"
        printf "AI_PROVIDER_ORDER=%s\n" "$(escape_env "$AI_PROVIDER_ORDER")"
        printf "OPEN_ROUTER_API_KEY=%s\n" "$(escape_env "$OPEN_ROUTER_API_KEY")"
        printf "OPENROUTER_CHAT_MODEL=%s\n" "$(escape_env "$OPENROUTER_CHAT_MODEL")"
        printf "OPENROUTER_SITE_URL=%s\n" "$(escape_env "$OPENROUTER_SITE_URL")"
        printf "OPENROUTER_APP_NAME=%s\n" "$(escape_env "$OPENROUTER_APP_NAME")"
        printf "OPENAI_API_KEY=%s\n" "$(escape_env "$OPENAI_API_KEY")"
        printf "OPENAI_CHAT_MODEL=%s\n" "$(escape_env "$OPENAI_CHAT_MODEL")"
        printf "GEMINI_API_KEY=%s\n" "$(escape_env "$GEMINI_API_KEY")"
        printf "GEMINI_MODEL=%s\n" "$(escape_env "$GEMINI_MODEL")"
        printf "CURRENCY_API_KEY=%s\n" "$(escape_env "$CURRENCY_API_KEY")"
        printf "GROQ_API_KEY=%s\n" "$(escape_env "$GROQ_API_KEY")"
        printf "TWELVE_DATA=%s\n" "$(escape_env "$TWELVE_DATA")"
    } > .env
fi

# 3. Pull and start services
echo "🏗️ Pulling application images..."
# Only pull application images by default to speed up deployment. 
# Infrastructure images (Postgres, Redis, PgBouncer) change rarely.
docker compose -f docker-compose.prod.yml pull woolet-api woolet-web woolet-landing

echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

# 4. Run database setup and migrations
echo "🔄 Running database setup and migrations..."
# Update BUILD_DATABASE_URL from possibly sourced variables
BUILD_DATABASE_URL="postgresql://${DB_USER:-woolet_app}:${DB_PASSWORD:-password}@${POSTGRES_HOST:-woolet-postgres}:5432/${DB_NAME:-woolet}"

# Wait a few seconds for the database service to be ready
sleep 5
echo "🏗️ Ensuring database exists..."
# Bypass PgBouncer and connect directly to Postgres for setup
docker compose -f docker-compose.prod.yml exec -T \
    -e DATABASE_URL="$BUILD_DATABASE_URL" \
    woolet-api bun run db:setup

echo "🔄 Running migrations..."
docker compose -f docker-compose.prod.yml exec -T \
    -e DATABASE_URL="$BUILD_DATABASE_URL" \
    woolet-api bun run db:migrate

# 5. Wait for API to be healthy
echo "🔄 Waiting for API to be ready..."
sleep 5

# Check if API is healthy
for i in {1..30}; do
    if docker compose -f docker-compose.prod.yml exec -T woolet-api curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ API is healthy!"
        break
    fi
    echo "Waiting for API... ($i/30)"
    sleep 2
done

# 6. Clean up unused images
echo "🧹 Cleaning up..."
docker image prune -f

echo "✅ Deployment complete!"
