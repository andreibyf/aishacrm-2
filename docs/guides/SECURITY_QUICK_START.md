# Quick Security Implementation Guide

## ✅ Completed

1. **RLS Migration Created**: `backend/migrations/999_enable_rls_policies.sql`
   - Enables RLS on 18 tables
   - Service role bypass policies for backend API
   - Blocks unauthorized direct database access

2. **Environment Template Updated**: `backend/.env.example`
   - Comprehensive security-focused configuration
   - Production deployment checklist included
   - Clear REQUIRED vs OPTIONAL sections

3. **JWT Secret Generated**:
   ```
   cd33072ecf1243bd58a29c46ae3c7a6030b5942a153ca008ae9ba63e8bf66ab165264dd944beca52b779ee333fa23272ceff4e62a1594e4d562dcc8ce5c51c8e
   ```
   - Add to `backend/.env` for local dev
   - Add to platform secrets for production (Railway Variables or Vercel Environment Variables)

4. **Helper Script Created**: `backend/apply-rls-policies.js`
   - Automated RLS policy application
   - Verification and status reporting
   - Usage: `node apply-rls-policies.js`

5. **Production Guide Created**: `PRODUCTION_SECURITY_GUIDE.md`
   - Complete security checklist
   - Deployment procedures for Railway and Vercel
   - Monitoring setup, secret rotation schedule
   - Incident response procedures

---

## 🚨 Immediate Actions Required

### 1. Apply RLS Policies (5 minutes)

**Option A - Automated**:
```bash
cd backend
node apply-rls-policies.js
```

**Option B - Manual**:
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `backend/migrations/999_enable_rls_policies.sql`
3. Paste and click "Run"
4. Verify: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';`

---

### 2. Configure JWT_SECRET (2 minutes)

**Local Development**:
```bash
# Edit backend/.env
JWT_SECRET=cd33072ecf1243bd58a29c46ae3c7a6030b5942a153ca008ae9ba63e8bf66ab165264dd944beca52b779ee333fa23272ceff4e62a1594e4d562dcc8ce5c51c8e
```

**Production (Railway)**:
1. Railway Dashboard → Your Project → Variables
2. Click "New Variable"
3. Name: `JWT_SECRET`
4. Value: (paste generated secret above)
5. Click "Add" → Redeploy

**Production (Vercel)**:
1. Project Settings → Environment Variables
2. Add new variable:
   - Key: `JWT_SECRET`
   - Value: (paste generated secret above)
   - Environments: Production ✓
3. Save → Redeploy

---

### 3. Remove DEFAULT_USER_PASSWORD (5 minutes)

**In `backend/.env.example`**:
```bash
# OLD (remove this):
DEFAULT_USER_PASSWORD=Welcome2024!

# NEW (add this):
# DEPRECATED: Do not use a default password in production
# Generate random passwords per user:
#   const tempPassword = crypto.randomBytes(16).toString('base64');
```

**In your user creation code** (if using default password):
```javascript
// BEFORE
const password = process.env.DEFAULT_USER_PASSWORD || 'Welcome2024!';

// AFTER
const crypto = require('crypto');
const tempPassword = crypto.randomBytes(16).toString('base64');
// Send via email with forced password reset on first login
```

---

### 4. Verify Security Middleware (3 minutes)

**Check `backend/server.js` includes**:

```javascript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

// Security headers
app.use(helmet());

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.API_RATE_LIMIT_WINDOW_MS || 60000,
  max: process.env.API_RATE_LIMIT_MAX_REQUESTS || 100,
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);
```

**Update production `.env`**:
```bash
ALLOWED_ORIGINS=https://yourcrm.com,https://www.yourcrm.com
```

---

## 📋 Pre-Deployment Checklist

Copy this and check off each item before going live:

```
Production Security Checklist:

Database:
[ ] RLS policies applied (node apply-rls-policies.js)
[ ] All migrations run in order
[ ] Automated backups enabled in Supabase
[ ] RLS verified: service_role bypasses, anon key blocked

Secrets:
[ ] JWT_SECRET configured (128 chars) in platform secrets
[ ] Supabase keys rotated if previously exposed
[ ] backend/.env removed from git history
[ ] .gitignore includes .env* files
[ ] DEFAULT_USER_PASSWORD removed/deprecated

Configuration:
[ ] NODE_ENV=production
[ ] ALLOWED_ORIGINS set to production domain(s)
[ ] Rate limiting configured (100 req/min)
[ ] CORS tested with production frontend

Middleware:
[ ] helmet.js security headers enabled
[ ] express-rate-limit active
[ ] CORS properly configured

Monitoring:
[ ] Supabase logging enabled
[ ] Error tracking configured (Sentry)
[ ] Health endpoint monitored (UptimeRobot)
[ ] Audit log monitoring set up

Testing:
[ ] Backend health check returns 200
[ ] RLS blocks direct anon key access
[ ] API requests via backend work normally
[ ] Rate limiter returns 429 after threshold
[ ] CORS headers present in responses

Documentation:
[ ] Secret rotation schedule documented
[ ] Incident response plan reviewed
[ ] Team trained on secret management
```

---

## 🚀 Quick Deployment

### Railway (Backend)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and create project
railway login
cd backend
railway init

# 3. Add environment variables in Railway Dashboard:
#    - NODE_ENV=production
#    - JWT_SECRET=cd33072ecf1243bd58a29c46ae3c7a6030b5942a153ca008ae9ba63e8bf66ab165264dd944beca52b779ee333fa23272ceff4e62a1594e4d562dcc8ce5c51c8e
#    - SUPABASE_URL=https://your-project.supabase.co
#    - SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
#    - ALLOWED_ORIGINS=https://yourcrm.vercel.app

# 4. Deploy
railway up

# 5. Get deployment URL
railway domain
# Note the URL (e.g., https://your-app.railway.app)
```

### Vercel (Frontend)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login and deploy
vercel login
vercel

# 3. Configure environment variables in Vercel Dashboard:
#    Project Settings → Environment Variables → Production:
#    - VITE_AISHACRM_BACKEND_URL=https://your-app.railway.app
#    - VITE_SUPABASE_URL=https://your-project.supabase.co
#    - VITE_SUPABASE_ANON_KEY=your_anon_key

# 4. Deploy to production
vercel --prod
```

---

## 🔍 Verification Commands

After deployment, run these to verify everything works:

```bash
# 1. Backend health
curl https://your-app.railway.app/api/health
# Expected: {"status":"ok","timestamp":"2024-..."}

# 2. CORS headers
curl -I -H "Origin: https://yourcrm.vercel.app" https://your-app.railway.app/api/health
# Expected: Access-Control-Allow-Origin: https://yourcrm.vercel.app

# 3. Rate limiting (from your machine)
for i in {1..101}; do curl https://your-app.railway.app/api/health; done
# Expected: Last request returns 429 Too Many Requests

# 4. Security headers
curl -I https://your-app.railway.app/api/health
# Expected headers: X-Content-Type-Options, X-Frame-Options, etc.
```

**RLS Verification** (in Supabase SQL Editor):
```sql
-- Should show all tables with rowsecurity = true
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname='public' 
ORDER BY tablename;
```

---

## 📞 Support Resources

- **Full Guide**: `PRODUCTION_SECURITY_GUIDE.md`
- **RLS Script**: `backend/apply-rls-policies.js`
- **Environment Template**: `backend/.env.example`
- **Supabase Docs**: https://supabase.com/docs
- **Railway Docs**: https://docs.railway.app
- **Vercel Docs**: https://vercel.com/docs
