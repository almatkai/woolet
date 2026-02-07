# Use the official Bun image for building
FROM oven/bun:1.3-slim AS build
WORKDIR /app

# Install dependencies - copy all workspace package.json files for lockfile validation
COPY package.json bun.lock ./
COPY apps/landing/package.json ./apps/landing/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY apps/chrome-extension/package.json ./apps/chrome-extension/
COPY packages/shared/package.json ./packages/shared/
RUN bun install

# Build the application
COPY . .
RUN bun run build --filter=@woolet/landing

# Use a lightweight web server to serve the static files
FROM nginx:stable-alpine AS runner
COPY --from=build /app/apps/landing/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
