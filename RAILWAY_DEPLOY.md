# Railway Deployment Guide

## 🚂 Quick Deploy Steps

### 1. Create Two Services in Railway

In your Railway dashboard, you should create **two separate services** from the same repo:

#### Service 1: Backend
- **Name:** `aishacrm-backend`
- **Root Directory:** `/backend`
- **Start Command:** `npm start`
- **Health Check:** `/health`

#### Service 2: Frontend
- **Name:** `aishacrm-frontend`
- **Root Directory:** `/` (root of repo)
- **Build Command:** `npm run build`
- **Start Command:** `npm run preview`
- **Health Check:** `/`

---

## 🔧 Configuration Steps

### Step 1: Deploy Backend First

1. In Railway Dashboard → New Service → Connect to GitHub
2. Select `andreibyf/aishacrm-2` repository
3. Name it: `aishacrm-backend`
4. **Settings → Service:**
   - Root Directory: `/backend`
   - Watch Paths: `backend/**`
5. **Variables tab:** Add all backend env vars from `RAILWAY_ENV_GUIDE.md`
6. Railway will auto-deploy
7. **Copy the generated URL** (e.g., `https://aishacrm-backend-production.up.railway.app`)

### Step 2: Deploy Frontend

1. Railway Dashboard → New Service → Connect to GitHub
2. Select same `andreibyf/aishacrm-2` repository
3. Name it: `aishacrm-frontend`
4. **Settings → Service:**
   - Root Directory: `/` (leave empty or set to root)
   - Watch Paths: `src/**,public/**,index.html,vite.config.js,package.json`
5. **Variables tab:** Add frontend env vars
   - **Important:** Set `VITE_AISHACRM_BACKEND_URL` to the backend URL from Step 1
6. Railway will auto-deploy

---

## 🔍 Verify Deployment

### Check Backend:
```bash
# Health check
curl https://your-backend.up.railway.app/health

# Should return: { "status": "healthy", ... }
```

### Check Frontend:
Visit: `https://your-frontend.up.railway.app`

---

## 🎯 Custom Domains (Optional)

### Backend Domain:
1. Railway Dashboard → Backend Service → Settings
2. Add custom domain: `api.yourdomain.com`
3. Add CNAME record in your DNS: `api.yourdomain.com` → Railway's domain

### Frontend Domain:
1. Railway Dashboard → Frontend Service → Settings
2. Add custom domain: `yourdomain.com` or `app.yourdomain.com`
3. Add CNAME/A record in your DNS

---

## 📊 Monitoring

Railway provides:
- **Logs:** Click on service → "Logs" tab
- **Metrics:** CPU, Memory, Network usage
- **Deployments:** History of all deployments
- **Usage:** Track monthly costs

---

## 🔄 Auto-Deploy on Git Push

Railway automatically:
1. Watches your GitHub repo
2. Detects changes to watched paths
3. Rebuilds and redeploys affected service
4. Runs health checks before switching traffic

**To deploy manually:**
1. Dashboard → Service → Deployments
2. Click "Redeploy" on any past deployment

---

## 🐛 Troubleshooting

### Backend won't start:
```bash
# Check logs in Railway Dashboard
# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port binding (Railway auto-assigns PORT)
```

### Frontend shows API errors:
```bash
# Verify VITE_AISHACRM_BACKEND_URL is set correctly
# Check CORS settings in backend/server.js
# Ensure backend is deployed and healthy
```

### Database connection issues:
```bash
# Verify Supabase DATABASE_URL is correct
# Check if Supabase allows connections from Railway IPs
# Supabase → Settings → Database → Connection pooler must be enabled
```

---

## 💰 Cost Optimization

**Free tier tips:**
- Backend will use ~$3-5/month (always-on)
- Frontend (static) uses ~$0-1/month
- Monitor usage in Railway Dashboard

**To reduce costs:**
- Use sleep schedule for staging (Settings → Sleep after inactivity)
- Deploy frontend to Cloudflare Pages (free) instead
- Use Supabase free tier (500MB DB)

---

## 🔐 Environment Variable Updates

When you update env vars in Railway:
1. Go to Service → Variables
2. Edit or add variables
3. Railway auto-redeploys the service
4. Changes take effect immediately after deploy

---

## 📝 Next Steps After Deploy

1. ✅ Test login flow
2. ✅ Verify database operations (create/read/update/delete)
3. ✅ Check file uploads (if using storage)
4. ✅ Run smoke tests: `.\run-staging-smoke.ps1 -Url https://your-frontend.up.railway.app`
5. ✅ Set up custom domains
6. ✅ Enable monitoring/alerts
7. ✅ Configure backups (Supabase handles DB backups)

---

## 🆘 Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Your logs: Railway Dashboard → Service → Logs tab
