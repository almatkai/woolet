#!/bin/bash
# Stop on error
set -e

echo "🚀 Starting deployment..."

# 1. Pull latest changes (if in git repo)
# git pull origin main

# Set default values for identities
DB_ADMIN_USER="${DB_ADMIN_USER:-postgres}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-password}"
DB_USER="${DB_USER:-woolet_app}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-woolet}"
DB_PORT="${DB_PORT:-5433}"
POSTGRES_HOST="woolet-postgres"

# Helper function to URL encode values (requires python3)
url_encode() {
    python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

# 2. Generate .env file from .env.example
echo "🏗️  Generating .env file from environment variables..."

if [ ! -f .env.example ]; then
    echo "❌ Error: .env.example file not found!"
    exit 1
fi

# Clear .env file
> .env

# Read .env.example line by line
while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    if [[ "$line" =~ ^#.* ]] || [[ -z "$line" ]]; then
        continue
    fi

    # Extract key (everything before the first =)
    key=$(echo "$line" | cut -d '=' -f 1)
    
    # Get value from environment variable
    value=$(printenv "$key" || true)
    
    # If the variable is set in the environment, use it
    if [ -n "$value" ]; then
        # Escape single quotes for .env format
        # Replace ' with '\''
        escaped_value=$(echo "$value" | sed "s/'/'\\\\''/g")
        echo "$key='$escaped_value'" >> .env
    else
        # If not in env, check if .env.example has a default value
        default_value=$(echo "$line" | cut -d '=' -f 2-)
        
        if [ -n "$default_value" ]; then
             echo "$key=$default_value" >> .env
        else
             echo "# $key is missing from environment" >> .env
             echo "⚠️  Warning: $key not found in environment and no default in .env.example"
        fi
    fi
done < .env.example

# Fallback for DATABASE_URL if it wasn't set
if ! grep -q "^DATABASE_URL=" .env; then
    echo "ℹ️  DATABASE_URL not found in env, constructing default..."
    echo "DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@woolet-pgbouncer:5432/$DB_NAME\"" >> .env
fi

# Export CURRENCY_API_KEY for use in this session if needed
if [ -n "$CURRENCY_API_KEY" ]; then
    export CURRENCY_API_KEY
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
# Use URL encoded values for the ADMIN user (super-user)
ENCODED_ADMIN_USER=$(url_encode "$DB_ADMIN_USER")
ENCODED_ADMIN_PASS=$(url_encode "$DB_ADMIN_PASSWORD")
ENCODED_DB=$(url_encode "$DB_NAME")
MIGRATION_DATABASE_URL="postgresql://${ENCODED_ADMIN_USER}:${ENCODED_ADMIN_PASS}@${POSTGRES_HOST}:5432/${ENCODED_DB}"

# Wait a few seconds for the database service to be ready
sleep 5
echo "🏗️ Ensuring database exists..."
# Connect as DB_ADMIN_USER to setup the database and grant permissions
docker compose -f docker-compose.prod.yml exec -T \
    -e DATABASE_URL="$MIGRATION_DATABASE_URL" \
    -e DB_USER="$DB_USER" \
    -e DB_PASSWORD="$DB_PASSWORD" \
    woolet-api bun run db:setup

echo "🔄 Running migrations..."
# Connect as DB_ADMIN_USER to perform migrations (needs high privileges)
docker compose -f docker-compose.prod.yml exec -T \
    -e DATABASE_URL="$MIGRATION_DATABASE_URL" \
    woolet-api bun run db:migrate

echo "🛡️ Running fallback migrations..."
docker compose -f docker-compose.prod.yml exec -T \
    -e DATABASE_URL="$MIGRATION_DATABASE_URL" \
    woolet-api bun run run-migration.ts

# 5. Wait for API to be healthy
echo "🔄 Waiting for API to be ready..."
sleep 5

# Check if API is healthy
for i in {1..30}; do
    if docker compose -f docker-compose.prod.yml exec -T woolet-api curl -s http://localhost:3005/health > /dev/null 2>&1; then
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
