# Docker Deployment Guide for Aisha CRM

This guide covers Docker deployment for both local development and Railway production.

## 🐳 Why Docker?

**Advantages over Nixpacks:**
- ✅ **Consistent builds** - same environment every time
- ✅ **Faster deploys** - Docker layer caching
- ✅ **Better control** - explicit dependencies and build steps
- ✅ **Easier debugging** - test production builds locally
- ✅ **Multi-stage builds** - smaller, more secure images
- ✅ **No OOM issues** - proper memory allocation in build stage

## 📁 Docker Files Overview

```
aishacrm-2/
├── Dockerfile              # Frontend production build
├── .dockerignore           # Frontend ignore patterns
├── docker-compose.yml      # Full stack orchestration
├── railway.json            # Railway config (uses Docker)
└── backend/
    ├── Dockerfile          # Backend production build
    ├── .dockerignore       # Backend ignore patterns
    └── railway.json        # Backend Railway config
```

## 🚀 Quick Start - Local Development

### 1. Prerequisites

```powershell
# Install Docker Desktop for Windows
# Download from: https://www.docker.com/products/docker-desktop

# Verify installation
docker --version
docker-compose --version
```

### 2. Environment Setup

You have ready-to-copy Docker env examples:

- Root: `.env.docker.example` → copy to `.env`
- Backend: `backend/.env.docker.example` → copy to `backend/.env`

```powershell
# From repo root
copy .env.docker.example .env
copy backend/.env.docker.example backend/.env
```

Alternatively, you can run Compose with an explicit env file:

```powershell
# Use a separate env file without renaming
docker-compose --env-file .env.docker up --build
```

### 3. Start the Full Stack

```powershell
# Build and start all services (frontend, backend, database)
docker-compose up --build

# Or run in background
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

### 4. Access the Application

- Frontend: http://localhost:4000
- Backend API: http://localhost:4001
- Backend Health: http://localhost:4001/health
- API Docs: http://localhost:4001/api-docs
- PostgreSQL: localhost:5432 (if using local DB profile)

## 🏗️ Building Individual Services

### Frontend Only

```powershell
# Build frontend image
docker build -t aishacrm-frontend .

# Run frontend (requires backend to be running)
docker run -p 4000:3000 \
  -e PORT=3000 \
  -e VITE_AISHACRM_BACKEND_URL=http://localhost:4001 \
  -e VITE_SUPABASE_URL=https://your-project.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=your-anon-key \
  aishacrm-frontend
```

### Backend Only

```powershell
# Build backend image
cd backend
docker build -t aishacrm-backend .

# Run backend
docker run -p 4001:3001 \
  -e DATABASE_URL=your-connection-string \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  -e JWT_SECRET=your-jwt-secret \
  aishacrm-backend
```

## 🌐 Railway Deployment (Production)

### Configuration

Railway automatically detects `railway.json` and uses Docker builds.

**Frontend** (`railway.json`):
- Uses `Dockerfile` in root
- Health check on `/`
- Auto-restart on failure

**Backend** (`backend/railway.json`):
- Uses `backend/Dockerfile`
- Health check on `/health`
- Auto-restart on failure

### Environment Variables on Railway

You still need to set these in Railway dashboard:

**Frontend Service:**
```bash
VITE_AISHACRM_BACKEND_URL=https://your-backend-service.up.railway.app
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
NODE_ENV=production
```

**Backend Service:**
```bash
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret
ALLOWED_ORIGINS=https://your-frontend.up.railway.app
NODE_ENV=production
```

### Deploy to Railway

```powershell
# Commit Docker changes
git add Dockerfile backend/Dockerfile docker-compose.yml railway.json backend/railway.json
git commit -m "Docker: production-ready multi-stage builds for Railway"
git push origin main
```

Railway will:
1. Detect `railway.json` for each service
2. Build using Docker (instead of Nixpacks)
3. Use layer caching for faster builds
4. Run health checks
5. Auto-restart on failure

## 🔍 Docker Build Details

### Frontend Dockerfile (Multi-stage)

**Stage 1: Builder**
- Node 22 Alpine (small base image)
- Install ALL dependencies (including Vite dev deps)
- Run build with `NODE_OPTIONS=--max-old-space-size=896`
- Output: `dist/` folder

**Stage 2: Runner**
- Fresh Node 22 Alpine
- Install only `serve` package
- Copy built `dist/` from builder
- Serve static files
- **Result:** Small image (~100MB vs ~800MB)

### Backend Dockerfile (Multi-stage)

**Stage 1: Builder**
- Node 22 Alpine
- Install production dependencies only
- Copy source code

**Stage 2: Runner**
- Fresh Node 22 Alpine
- Copy node_modules and source from builder
- Run `node server.js`
- **Result:** Smaller, more secure image

### Benefits of Multi-stage Builds

1. **Smaller images** - Only runtime files in final image
2. **Faster deploys** - Less data to transfer
3. **More secure** - No dev dependencies in production
4. **Layer caching** - Unchanged layers are reused

## 🧪 Testing Docker Builds Locally

Before deploying to Railway, test your Docker builds:

```powershell
# Build exactly like Railway will
docker build -t test-frontend .
docker build -t test-backend ./backend

# Run to verify
docker run -p 4000:3000 test-frontend
docker run -p 4001:3001 \
  -e DATABASE_URL=your-db-url \
  test-backend

# Check health
curl http://localhost:4000/
curl http://localhost:4001/health

## 🏁 Production Compose (Recommended)

For a minimal, production-ready stack (frontend + backend + redis) with the correct project ports, use the provided `docker-compose.prod.yml`.

```powershell
# Build and start in the background
docker compose -f docker-compose.prod.yml up -d --build

# View service health and status
docker compose -f docker-compose.prod.yml ps

# Tail logs
docker compose -f docker-compose.prod.yml logs -f backend

# Stop and remove
docker compose -f docker-compose.prod.yml down
```

Notes:
- Frontend: http://localhost:4000
- Backend: http://localhost:4001
- Ensure `backend/.env` points to your Supabase or database and includes `ALLOWED_ORIGINS=http://localhost:4000`.
```

## 📊 Monitoring & Debugging

### View Container Logs

```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Exec into Running Container

```powershell
# Get shell in running container
docker-compose exec backend sh
docker-compose exec frontend sh

# Run commands
docker-compose exec backend npm ls
docker-compose exec backend node --version
```

### Check Container Health

```powershell
# List running containers with health status
docker-compose ps

# Inspect health
docker inspect aishacrm-backend | grep -A 10 Health
```

## 🐛 Troubleshooting

### Build Fails with OOM

**Solution:** Increase Docker memory limit

1. Docker Desktop → Settings → Resources
2. Set Memory to at least 4GB
3. Restart Docker

### "Cannot connect to database"

**Local:**
```powershell
# Check if DB container is running
docker-compose ps

# View DB logs
docker-compose logs db

# Ensure healthy
docker-compose ps | grep db | grep healthy
```

**Railway:**
- Verify `DATABASE_URL` is set correctly in Railway dashboard
- Check Railway backend logs for connection errors

### Frontend Can't Reach Backend

**Local:**
```powershell
# Ensure both services are on same network
docker network ls
docker network inspect aishacrm-2_default

# Check backend is accessible
curl http://localhost:3001/health
```

**Railway:**
- Verify `VITE_AISHACRM_BACKEND_URL` points to HTTPS backend domain
- Check CORS settings in backend

### Stale Cache Issues

```powershell
# Rebuild without cache
docker-compose build --no-cache

# Or for single service
docker-compose build --no-cache backend
```

## 📦 Image Size Optimization

Current image sizes (approximate):

- **Frontend:** ~100MB (Node Alpine + serve + static files)
- **Backend:** ~150MB (Node Alpine + dependencies + source)

**Tips for further optimization:**
- Use `.dockerignore` to exclude unnecessary files
- Multi-stage builds (already implemented)
- Alpine base images (already using)
- Prune unused layers: `docker system prune -a`

## 🔄 Migration from Nixpacks

**What changed:**

1. ❌ Removed `nixpacks.toml` (Railway will ignore it now)
2. ✅ Added `Dockerfile` for frontend and backend
3. ✅ Updated `railway.json` to use `"builder": "DOCKERFILE"`
4. ✅ Added `.dockerignore` to exclude unnecessary files
5. ✅ Multi-stage builds for smaller images

**Advantages gained:**

- No more OOM errors during build (controlled memory)
- Faster deploys (Docker layer caching)
- Consistent across local and Railway
- Can test production builds locally
- Better debugging capabilities

## 📦 Publishing Docker Images to GHCR

### Automated Tag Releases

The repo includes a GitHub Actions workflow (`.github/workflows/docker-release.yml`) that automatically builds and publishes Docker images to GitHub Container Registry (GHCR) when you push version tags.

**How It Works:**
- Trigger: Push a tag matching `v*` (e.g., `v1.2.3`)
- Builds: Frontend and backend images from `Dockerfile` and `backend/Dockerfile`
- Registry: `ghcr.io/<owner>/<repo>-frontend` and `ghcr.io/<owner>/<repo>-backend`
- Tags Applied:
  - `v1.2.3` (exact version)
  - `1.2` (major.minor)
  - `1` (major)
  - `sha-<commit>` (commit SHA)
  - `latest` (on default branch)

**Create and Push a Release Tag:**
```powershell
# Tag your commit
git tag v1.2.3

# Push the tag (triggers workflow)
git push origin v1.2.3
```

**Monitor the Build:**
- GitHub → Actions tab → "Docker Release (GHCR)" workflow
- Build takes ~5-10 minutes with caching
- Summary shows all published image tags

### Pulling Published Images

**Public Images (if visibility set to public):**
```powershell
docker pull ghcr.io/<owner>/<repo>-frontend:v1.2.3
docker pull ghcr.io/<owner>/<repo>-backend:v1.2.3
```

**Private Images (default):**
```powershell
# Create a Personal Access Token (PAT) with scope: read:packages
# GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

# Login to GHCR
echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull images
docker pull ghcr.io/<owner>/<repo>-frontend:v1.2.3
docker pull ghcr.io/<owner>/<repo>-backend:v1.2.3
```

**Using in Docker Compose:**
```yaml
services:
  backend:
    image: ghcr.io/<owner>/<repo>-backend:v1.2.3
    # ... rest of config
  
  frontend:
    image: ghcr.io/<owner>/<repo>-frontend:v1.2.3
    # ... rest of config
```

### Managing Image Visibility

**Default:** Images are private (only you and repo collaborators can access).

**To Make Public:**
1. GitHub → your repo → Packages (right sidebar)
2. Click the package (frontend or backend)
3. Package settings → Change visibility → Public
4. Confirm

**Access Control:**
- Private packages require authentication (PAT with `read:packages`)
- Public packages can be pulled by anyone
- GitHub Actions in the same repo use `GITHUB_TOKEN` automatically

### Updating Published Images

**New Version (Recommended):**
```powershell
# Bump version
git tag v1.2.4
git push origin v1.2.4
```

**Replace Existing Tag:**
```powershell
# Delete remote tag
git push origin :refs/tags/v1.2.3

# Recreate and push
git tag -f v1.2.3
git push origin v1.2.3
```

**Delete Old Versions:**
- GitHub → Packages → select package → Versions → delete unwanted versions

### Required Secrets (Optional)

The workflow uses default `GITHUB_TOKEN` (provided automatically). Optionally set these repo secrets for build-time frontend config:

- `VITE_AISHACRM_BACKEND_URL` (defaults to `http://localhost:4001`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**To set:**
- GitHub → repo Settings → Secrets and variables → Actions → New repository secret

## 📚 Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Railway Docker Deployment](https://docs.railway.app/deploy/dockerfiles)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

---

**Next Steps:**
1. Test locally: `docker-compose up --build`
2. Verify health checks work
3. Tag and push a release: `git tag v1.0.0 && git push origin v1.0.0`
4. Monitor GitHub Actions for successful image publish
5. Pull and deploy images from GHCR

For Railway environment variables, see: `RAILWAY_ENV_SETUP.md`
