#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# 2. Generate .env file from environment variables passed from GitHub Actions
echo "🏗️ Generating .env file..."
cat <<EOF > .env
DB_USER=$DB_USER
DB_NAME=$DB_NAME
DB_PASSWORD=$DB_PASSWORD
GLITCHTIP_DB_PASSWORD=$GLITCHTIP_DB_PASSWORD
GLITCHTIP_DOMAIN=$GLITCHTIP_DOMAIN
GLITCHTIP_FROM_EMAIL=$GLITCHTIP_FROM_EMAIL
GLITCHTIP_SECRET_KEY=$GLITCHTIP_SECRET_KEY
REDIS_PASSWORD=$REDIS_PASSWORD
CLERK_SECRET_KEY=$CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY
VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
WOOLET_API_IMAGE=$WOOLET_API_IMAGE
WOOLET_WEB_IMAGE=$WOOLET_WEB_IMAGE
WOOLET_LANDING_IMAGE=$WOOLET_LANDING_IMAGE
NODE_ENV=$NODE_ENV
API_URL=$API_URL
WEB_URL=$WEB_URL
GLITCHTIP_DSN_API=$GLITCHTIP_DSN_API
VITE_GLITCHTIP_DSN_WEB=$VITE_GLITCHTIP_DSN_WEB
VITE_PUBLIC_POSTHOG_KEY=$VITE_PUBLIC_POSTHOG_KEY
VITE_PUBLIC_POSTHOG_HOST=$VITE_PUBLIC_POSTHOG_HOST
LOG_LEVEL=$LOG_LEVEL
AI_PROVIDER_ORDER=$AI_PROVIDER_ORDER
OPEN_ROUTER_API_KEY=$OPEN_ROUTER_API_KEY
OPENROUTER_CHAT_MODEL=$OPENROUTER_CHAT_MODEL
OPENROUTER_SITE_URL=$OPENROUTER_SITE_URL
OPENROUTER_APP_NAME=$OPENROUTER_APP_NAME
OPENAI_API_KEY=$OPENAI_API_KEY
OPENAI_CHAT_MODEL=$OPENAI_CHAT_MODEL
GEMINI_API_KEY=$GEMINI_API_KEY
GEMINI_MODEL=$GEMINI_MODEL
CURRENCY_API_KEY=$CURRENCY_API_KEY
GROQ_API_KEY=$GROQ_API_KEY
TWELVE_DATA=$TWELVE_DATA
EOF

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
