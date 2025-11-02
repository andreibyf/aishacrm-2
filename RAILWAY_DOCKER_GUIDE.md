# Running Docker on Railway - Quick Guide

## ✅ You're Already Set Up!

Your repo is **already configured** to use Docker on Railway. The `railway.json` files tell Railway to build with Docker instead of Nixpacks.

## 🎯 How Railway Uses Docker (Automatic)

### What Happens When You Push

```
git push origin main
    ↓
Railway detects railway.json
    ↓
Sees "builder": "DOCKERFILE"
    ↓
Runs docker build using your Dockerfile
    ↓
Pushes image to Railway registry
    ↓
Deploys container
    ↓
Runs health checks
```

## 📋 Current Configuration

### Frontend Service
- **Config:** `railway.json` (root)
- **Dockerfile:** `Dockerfile` (root)
- **Health check:** `/` 
- **What it does:**
  1. Build stage: `npm ci --include=dev` + `npm run build`
  2. Runner stage: serves `dist/` with `serve` on port $PORT

### Backend Service
- **Config:** `backend/railway.json`
- **Dockerfile:** `backend/Dockerfile`
- **Health check:** `/health`
- **What it does:**
  1. Build stage: `npm ci --omit=dev`
  2. Runner stage: runs `node server.js` on port $PORT

## 🚀 Deployment Steps (No Docker Commands Needed!)

Railway handles everything automatically. You just need to:

### 1. Set Environment Variables in Railway Dashboard

**Backend Service → Variables:**
```bash
DATABASE_URL=postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres
SUPABASE_URL=https://ehjlenywplgyiahgxkfj.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
JWT_SECRET=<generate-random-secret>
ALLOWED_ORIGINS=https://aishacrm-2-staging.up.railway.app
NODE_ENV=production
```

**Frontend Service → Variables:**
```bash
VITE_AISHACRM_BACKEND_URL=https://motivated-quietude-staging.up.railway.app
VITE_SUPABASE_URL=https://ehjlenywplgyiahgxkfj.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
NODE_ENV=production
```

### 2. Push to GitHub

```powershell
git push origin main
```

That's it! Railway will:
- ✅ Detect the railway.json config
- ✅ Build using Docker (not Nixpacks)
- ✅ Use layer caching (faster subsequent builds)
- ✅ Deploy the container
- ✅ Run health checks
- ✅ Auto-restart on failure

## 🔍 Verify Docker Is Being Used

In Railway dashboard:

1. Go to your service deployment logs
2. Look for these indicators:
   ```
   #1 [internal] load build definition from Dockerfile
   #2 [internal] load .dockerignore
   ...
   => CACHED [builder 1/5] FROM docker.io/library/node:22-alpine
   ```

If you see `CACHED` lines, Docker layer caching is working! 🎉

## 📊 Monitoring Your Docker Deployment

### Check Deployment Status

**Railway Dashboard:**
- Services → Your Service → Deployments
- Look for green checkmark (healthy)
- Click deployment to see build logs

### Test Health Endpoints

```powershell
# Backend health (should show "database": "connected")
curl https://motivated-quietude-staging.up.railway.app/health

# Backend root (shows API info)
curl https://motivated-quietude-staging.up.railway.app/

# Frontend (should load your app)
curl https://aishacrm-2-staging.up.railway.app/
```

### View Logs

**Railway Dashboard:**
- Services → Your Service → Deployments → View Logs
- Real-time stream of container output
- Filter by severity (Info, Warning, Error)

## 🐛 Troubleshooting

### Build Fails

**Check:**
1. Railway deployment logs for Docker errors
2. Make sure `Dockerfile` and `railway.json` are in the correct directories
3. Verify `.dockerignore` isn't excluding critical files

**Common issues:**
- "No such file or directory" → Check paths in Dockerfile
- "COPY failed" → File might be in `.dockerignore`
- "npm ci failed" → Check package-lock.json is committed

### Runtime Fails (Container Exits)

**Check:**
1. Environment variables are set correctly
2. Health check endpoint is responding (e.g., `/health` for backend)
3. Port matches what Railway expects (`$PORT` env var)

**View container logs:**
- Railway Dashboard → Deployments → View Logs
- Look for startup errors

### "Not using Docker" / Still using Nixpacks

**Fix:**
1. Ensure `railway.json` exists in service root directory
2. Verify `"builder": "DOCKERFILE"` is set
3. Delete any `nixpacks.toml` files (they're ignored but can confuse)
4. Redeploy or push a new commit

## 🎯 Benefits You're Getting with Docker

| Feature | Before (Nixpacks) | Now (Docker) |
|---------|------------------|--------------|
| **Build Time** | 3-5 min | 1-2 min (with cache) |
| **Consistency** | Platform-dependent | Identical everywhere |
| **Control** | Limited | Full control |
| **Debugging** | Hard | Easy (test locally) |
| **Image Size** | ~500MB | ~100-150MB |
| **OOM Errors** | Common | Rare (controlled) |

## 🔄 Making Changes

When you need to update your app:

```powershell
# 1. Make changes locally
# 2. Test with docker-compose (optional but recommended)
docker-compose up --build

# 3. Commit and push
git add .
git commit -m "Your changes"
git push origin main

# Railway automatically rebuilds and redeploys!
```

## 📚 Related Documentation

- **Local Docker:** See `DOCKER_DEPLOYMENT.md` for running Docker locally
- **Environment Variables:** See `RAILWAY_ENV_SETUP.md` for all required env vars
- **Railway Docs:** https://docs.railway.app/deploy/dockerfiles

## 🆘 Quick Commands

```powershell
# Test backend Docker build locally
cd backend
docker build -t test-backend .
docker run -p 3001:3001 -e DATABASE_URL=... test-backend

# Test frontend Docker build locally
docker build -t test-frontend .
docker run -p 3000:3000 test-frontend

# Full stack locally (with docker-compose)
docker-compose up --build

# View Railway deployment status
# Go to: https://railway.app/dashboard
```

---

## ✨ Summary

**You don't need to run Docker commands for Railway deployment!**

Railway automatically:
1. Detects your `railway.json` (already configured ✅)
2. Builds using your `Dockerfile` (already created ✅)
3. Deploys the container
4. Runs health checks
5. Manages restarts

**Your only job:**
1. Set environment variables in Railway dashboard (one-time)
2. Push code to GitHub
3. Railway handles the rest!

Current status: **Ready to deploy** 🚀

Just set those environment variables and your next push will deploy with Docker!
