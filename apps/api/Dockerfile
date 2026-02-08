# Use the official Bun image
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Stage 1: Install dependencies - copy all workspace package.json files for lockfile validation
FROM base AS install
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/landing/package.json ./apps/landing/
COPY apps/mobile/package.json ./apps/mobile/
COPY apps/chrome-extension/package.json ./apps/chrome-extension/
COPY packages/shared/package.json ./packages/shared/
RUN bun install

# Stage 2: Build the application
FROM base AS build
# Copy everything from install stage (includes node_modules with workspace links)
COPY --from=install /app ./
# Overlay with source code
COPY . .
RUN bun run build --filter=@woolet/api

# Stage 3: Production runner
FROM base AS runner
# Add a non-root user for security
RUN useradd -m -s /bin/bash woolet-api
USER woolet-api

WORKDIR /app

COPY --from=install --chown=woolet-api:woolet-api /app/node_modules ./node_modules
COPY --from=install --chown=woolet-api:woolet-api /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/src/db ./apps/api/src/db
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/scripts ./apps/api/scripts
COPY --from=build --chown=woolet-api:woolet-api /app/apps/api/run-migration.ts ./apps/api/run-migration.ts

WORKDIR /app/apps/api

# Expose the API port
EXPOSE 3005

# Command to run the application
CMD ["bun", "run", "dist/index.js"]
