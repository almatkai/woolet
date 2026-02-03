# 🚢 Deployment Guide

This guide provides instructions for deploying the Woolet  project using Docker.

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

### 📊 Monitoring Stack (Self-Hosted GlitchTip)

To self-host GlitchTip for error tracking:

1. **Start the monitoring stack**:
   ```bash
   docker compose -f docker-compose.monitoring.yml up -d
   ```

2. **Access GlitchTip**:
   Open `http://localhost:8000` in your browser and create your account.

3. **Configure Project**:
   - Create a new Organization and Project in GlitchTip.
   - Copy the **DSN** provided by GlitchTip.
   - Update your `.env` with the DSN values:
     - `GLITCHTIP_DSN_API=your_dsn`
     - `VITE_GLITCHTIP_DSN_WEB=your_dsn`

4. **Restart App**:
   Restart the main Woolet app to apply the new DSNs.

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
