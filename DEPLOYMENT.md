# 🚢 Deployment Guide

This guide provides instructions for deploying the Woo-Let  project using Docker.

## 🐳 Docker Deployment

The project is split into two main services: `api` and `web`. Both have corresponding Dockerfiles in their respective directories.

### Prerequisites

- Docker and Docker Compose installed
- A Postgres database (e.g., Neon)
- A Redis instance (for rate limiting)
- A Clerk account for authentication

### Building and Running with Docker Compose

1. **Verify Environment Variables**: Create a `.env` file in the root directory based on `.env.example`.

2. **Run with Docker Compose**:
   ```bash
   docker compose up --build
   ```

### Individual Service Builds

If you prefer building services individually:

#### API Service
```bash
docker build -t woolet-api -f apps/api/Dockerfile .
docker run -p 3001:3001 --env-file .env woolet-api
```

#### Web Service
```bash
docker build -t woolet-web -f apps/web/Dockerfile .
docker run -p 80:80 woolet-web
```
> [!NOTE]
> The Web service is built as a static site and served via Nginx. Environment variables for the frontend are baked in at build time via Vite.

## 📋 Environment Variables Required

Ensure these are set in your production environment:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `CLERK_SECRET_KEY` | Clerk secret key for the API |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the Web client |
| `API_URL` | Public URL of the API |
| `WEB_URL` | Public URL of the Web client |
| `NODE_ENV` | Set to `production` |

## 🛠️ Build and Verification

To verify the build locally before deploying:
```bash
bun run build
```
This runs the Turborepo build pipeline across all packages.
