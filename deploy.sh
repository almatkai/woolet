#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# 2. Run tests
echo "🧪 Running tests..."
bun run test

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
