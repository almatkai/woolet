# Use the official Bun image for building
FROM oven/bun:1.1-slim AS build
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY apps/landing/package.json ./apps/landing/
RUN bun install --frozen-lockfile

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
