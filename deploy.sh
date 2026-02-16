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

# Remove old .env to force regeneration
rm -f .env

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
APP_SERVICES=""

# If shared deps changed, all app images are considered updated.
if [ "${SHARED_CHANGED:-false}" = "true" ] || [ "${CONFIG_CHANGED:-false}" = "true" ] || [ "${FORCE_DEPLOY:-false}" = "true" ]; then
    APP_SERVICES="woolet-api woolet-web woolet-landing"
else
    [ "${API_CHANGED:-false}" = "true" ] && APP_SERVICES="$APP_SERVICES woolet-api"
    [ "${WEB_CHANGED:-false}" = "true" ] && APP_SERVICES="$APP_SERVICES woolet-web"
    [ "${LANDING_CHANGED:-false}" = "true" ] && APP_SERVICES="$APP_SERVICES woolet-landing"
fi

APP_SERVICES=$(echo "$APP_SERVICES" | xargs || true)

if [ -n "$APP_SERVICES" ]; then
    echo "🏗️ Pulling updated application images: $APP_SERVICES"
    docker compose -f docker-compose.prod.yml pull $APP_SERVICES

    echo "🚀 Restarting updated app services..."
    docker compose -f docker-compose.prod.yml up -d --no-deps $APP_SERVICES
else
    echo "ℹ️ No application image changes detected; skipping app image pull."
fi

echo "🚀 Ensuring core services are running..."
docker compose -f docker-compose.prod.yml up -d woolet-postgres woolet-pgbouncer woolet-redis

# Wait for Postgres to be healthy before running migrations
echo "⏳ Waiting for Postgres to be ready..."
for i in {1..30}; do
    if docker compose -f docker-compose.prod.yml exec -T woolet-postgres pg_isready -U "${DB_ADMIN_USER}" -d "${DB_NAME}" > /dev/null 2>&1; then
        echo "✅ Postgres is ready"
        break
    fi
    echo "Waiting for Postgres... ($i/30)"
    sleep 2
done

# Check for containers that are restarting or exited and print recent logs to help debugging
echo "🔍 Checking container statuses for restarting/exited states..."
for i in {1..10}; do
    ps_out=$(docker compose -f docker-compose.prod.yml ps 2>/dev/null || true)
    echo "$ps_out"
    problem_containers=$(echo "$ps_out" | awk '/Restarting|Exit/ {print $1}' | tr '\n' ' ')
    if [ -z "$problem_containers" ]; then
        echo "✅ No restarting/exited containers detected"
        break
    fi

    echo "⚠️ Detected restarting/exited containers: $problem_containers. Collecting detailed diagnostics..."
    for c in $problem_containers; do
        echo "----- Recent logs (compose) for $c -----"
        docker compose -f docker-compose.prod.yml logs --details --timestamps --tail 1000 "$c" || true

        # Try to resolve the underlying container id and show Docker-level logs + inspect
        cid=$(docker compose -f docker-compose.prod.yml ps -q "$c" 2>/dev/null || true)
        if [ -z "$cid" ]; then
            # fallback to matching by name via docker ps
            cid=$(docker ps -aq --filter "name=$c" | head -n1 || true)
        fi

        if [ -n "$cid" ]; then
            echo "----- Docker logs (container id: $cid) for $c -----"
            docker logs --details --timestamps --tail 1000 "$cid" || true

            echo "----- Docker inspect (state summary) for $c -----"
            docker inspect "$cid" --format 'State.Status={{.State.Status}}  ExitCode={{.State.ExitCode}}  Error={{.State.Error}}  OOMKilled={{.State.OOMKilled}}  RestartCount={{.RestartCount}}  StartedAt={{.State.StartedAt}}  FinishedAt={{.State.FinishedAt}}' || true

            echo "----- Full State JSON for $c -----"
            docker inspect "$cid" --format '{{json .State}}' || true

            # If high restart count, save detailed logs to a temp file for later inspection
            rc=$(docker inspect "$cid" --format '{{.RestartCount}}' 2>/dev/null || true)
            if [ "${rc:-0}" -ge 3 ]; then
                fn="/tmp/${c}-logs-$(date +%s).log"
                echo "⚠️ High restart count ($rc) for $c — saving logs and inspect output to $fn"
                {
                    echo "=== compose logs ===";
                    docker compose -f docker-compose.prod.yml logs --details --timestamps --tail 2000 "$c" || true;
                    echo "=== docker logs ===";
                    docker logs --details --timestamps --tail 2000 "$cid" || true;
                    echo "=== docker inspect ===";
                    docker inspect "$cid" || true;
                } > "$fn" 2>&1 || true
                echo "Saved diagnostics to: $fn"
            fi
        else
            echo "❌ Could not find container id for $c (compose may not have started it)."
        fi
    done

    # Sleep briefly and retry status check
    sleep 3
done

# After retries, if we still see failing containers, abort so the issue can be fixed
ps_out=$(docker compose -f docker-compose.prod.yml ps 2>/dev/null || true)
problem_containers=$(echo "$ps_out" | awk '/Restarting|Exit/ {print $1}' | tr '\n' ' ')
if [ -n "$problem_containers" ]; then
    echo "❌ Containers still in restarting/exited state: $problem_containers"
    echo "Please inspect the logs above (and any files under /tmp) and fix the root cause before re-running the deployment. Aborting."
    exit 1
fi

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
docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -e DATABASE_URL="$MIGRATION_DATABASE_URL" \
    -e DB_USER="$DB_USER" \
    -e DB_PASSWORD="$DB_PASSWORD" \
    woolet-api bun run db:setup

echo "🔄 Running migrations..."
# Connect as DB_ADMIN_USER to perform migrations (needs high privileges)
docker compose -f docker-compose.prod.yml run --rm --no-deps \
    -e DATABASE_URL="$MIGRATION_DATABASE_URL" \
    woolet-api bun run db:migrate

echo "🛡️ Running fallback migrations..."
docker compose -f docker-compose.prod.yml run --rm --no-deps \
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
