#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# 2. Generate .env file from environment variables passed from GitHub Actions
echo "🏗️ Generating .env file..."
{
    printf "DB_USER=%s\n" "$DB_USER"
    printf "DB_NAME=%s\n" "$DB_NAME"
    printf "DB_PASSWORD=%s\n" "$DB_PASSWORD"
    printf "GLITCHTIP_DB_PASSWORD=%s\n" "$GLITCHTIP_DB_PASSWORD"
    printf "GLITCHTIP_DOMAIN=%s\n" "$GLITCHTIP_DOMAIN"
    printf "GLITCHTIP_FROM_EMAIL=%s\n" "$GLITCHTIP_FROM_EMAIL"
    printf "GLITCHTIP_SECRET_KEY=%s\n" "$GLITCHTIP_SECRET_KEY"
    printf "REDIS_PASSWORD=%s\n" "$REDIS_PASSWORD"
    printf "CLERK_SECRET_KEY=%s\n" "$CLERK_SECRET_KEY"
    printf "CLERK_PUBLISHABLE_KEY=%s\n" "$CLERK_PUBLISHABLE_KEY"
    printf "VITE_CLERK_PUBLISHABLE_KEY=%s\n" "$VITE_CLERK_PUBLISHABLE_KEY"
    printf "DATABASE_URL=%s\n" "$DATABASE_URL"
    printf "REDIS_URL=%s\n" "$REDIS_URL"
    printf "WOOLET_API_IMAGE=%s\n" "$WOOLET_API_IMAGE"
    printf "WOOLET_WEB_IMAGE=%s\n" "$WOOLET_WEB_IMAGE"
    printf "WOOLET_LANDING_IMAGE=%s\n" "$WOOLET_LANDING_IMAGE"
    printf "NODE_ENV=%s\n" "$NODE_ENV"
    printf "API_URL=%s\n" "$API_URL"
    printf "WEB_URL=%s\n" "$WEB_URL"
    printf "GLITCHTIP_DSN_API=%s\n" "$GLITCHTIP_DSN_API"
    printf "VITE_GLITCHTIP_DSN_WEB=%s\n" "$VITE_GLITCHTIP_DSN_WEB"
    printf "VITE_PUBLIC_POSTHOG_KEY=%s\n" "$VITE_PUBLIC_POSTHOG_KEY"
    printf "VITE_PUBLIC_POSTHOG_HOST=%s\n" "$VITE_PUBLIC_POSTHOG_HOST"
    printf "LOG_LEVEL=%s\n" "$LOG_LEVEL"
    printf "AI_PROVIDER_ORDER=%s\n" "$AI_PROVIDER_ORDER"
    printf "OPEN_ROUTER_API_KEY=%s\n" "$OPEN_ROUTER_API_KEY"
    printf "OPENROUTER_CHAT_MODEL=%s\n" "$OPENROUTER_CHAT_MODEL"
    printf "OPENROUTER_SITE_URL=%s\n" "$OPENROUTER_SITE_URL"
    printf "OPENROUTER_APP_NAME=%s\n" "$OPENROUTER_APP_NAME"
    printf "OPENAI_API_KEY=%s\n" "$OPENAI_API_KEY"
    printf "OPENAI_CHAT_MODEL=%s\n" "$OPENAI_CHAT_MODEL"
    printf "GEMINI_API_KEY=%s\n" "$GEMINI_API_KEY"
    printf "GEMINI_MODEL=%s\n" "$GEMINI_MODEL"
    printf "CURRENCY_API_KEY=%s\n" "$CURRENCY_API_KEY"
    printf "GROQ_API_KEY=%s\n" "$GROQ_API_KEY"
    printf "TWELVE_DATA=%s\n" "$TWELVE_DATA"
} > .env

# 3. Pull and start services
echo "🏗️ Pulling and starting services..."
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 4. Run database setup and migrations
echo "🔄 Running database setup and migrations..."
# Wait a few seconds for the database service to be ready
sleep 5
echo "🏗️ Ensuring database exists..."
docker compose -f docker-compose.prod.yml exec -T woolet-api bun run db:setup
echo "🔄 Running migrations..."
docker compose -f docker-compose.prod.yml exec -T woolet-api bun run db:migrate --filter=@woolet/api

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

# 5. Clean up unused images
echo "🧹 Cleaning up..."
docker image prune -f

echo "✅ Deployment complete!"
