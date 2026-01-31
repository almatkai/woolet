#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# 2. Run tests
echo "🧪 Running tests..."
bun run test

# 3. Build and start services
echo "🏗️ Building and starting services..."
docker compose up -d --build

# 4. Run database migrations
echo "🔄 Running database migrations..."
docker compose exec -T woolet-api bun run db:push

# 5. Clean up unused images
echo "🧹 Cleaning up..."
docker image prune -f

echo "✅ Deployment complete!"
