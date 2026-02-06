# Use the official Bun image
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Stage 1: Install dependencies
FROM base AS install
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# Stage 2: Build the application
FROM base AS build
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun run build --filter=@woolet/api

# Stage 3: Production runner
FROM base AS runner
# Add a non-root user for security
RUN useradd -m -s /bin/bash woolet-api
USER woolet-api

COPY --from=install --chown=woolet-api:woolet-api /app/node_modules ./node_modules
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/dist ./dist
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/package.json ./package.json

# Needed for drizzle-kit migrations in production
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/drizzle.config.ts ./drizzle.config.ts
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/drizzle ./drizzle
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/tsconfig.json ./tsconfig.json
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/src/db ./src/db

# Expose the API port
EXPOSE 3001

WORKDIR /app/apps/api

# Command to run the application
CMD ["bun", "run", "dist/index.js"]
