#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# 2. Generate .env file from environment variables passed from GitHub Actions
echo "🏗️ Generating .env file..."
cat <<EOF > .env
DB_PASSWORD=$DB_PASSWORD
GLITCHTIP_DB_PASSWORD=$GLITCHTIP_DB_PASSWORD
GLITCHTIP_DOMAIN=$GLITCHTIP_DOMAIN
GLITCHTIP_FROM_EMAIL=$GLITCHTIP_FROM_EMAIL
GLITCHTIP_SECRET_KEY=$GLITCHTIP_SECRET_KEY
REDIS_PASSWORD=$REDIS_PASSWORD
CLERK_SECRET_KEY=$CLERK_SECRET_KEY
VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
WOOLET_API_IMAGE=$WOOLET_API_IMAGE
WOOLET_WEB_IMAGE=$WOOLET_WEB_IMAGE
WOOLET_LANDING_IMAGE=$WOOLET_LANDING_IMAGE
EOF

# 3. Pull and start services
echo "🏗️ Pulling and starting services..."
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 4. Run database migrations
echo "🔄 Running database migrations..."
# Assuming migrator script is available in the api container
docker compose exec -T woolet-api bun run db:migrate --filter=@woolet/api

# 5. Clean up unused images
echo "🧹 Cleaning up..."
docker image prune -f

echo "✅ Deployment complete!"
