# Production Security Guide - Aisha CRM

This guide outlines the security measures required before deploying Aisha CRM to production.

## 🔒 Security Checklist

### 1. Row Level Security (RLS) ✅

**Status**: Migration created, ready to apply

**What**: RLS prevents unauthorized direct database access via the anon key while allowing the backend API (using service_role key) full access.

**How to Apply**:
```bash
# Option A: Using the helper script (recommended)
cd backend
node apply-rls-policies.js

# Option B: Manual application via Supabase SQL Editor
# Copy contents of backend/migrations/999_enable_rls_policies.sql
# Paste into Supabase Dashboard → SQL Editor → Run
```

**Verification**:
```sql
-- Run in Supabase SQL Editor
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname='public' 
ORDER BY tablename;
```

All tables should show `rowsecurity = true`.

**Testing**:
- ✅ Backend API should work normally (uses service_role key)
- ✅ Direct database access with anon key should return empty results
- ✅ Unauthenticated client requests should be blocked

---

### 2. JWT Secret Configuration ✅

**Status**: Template updated, secret needs generation

**Generate a Strong Secret**:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Configure**:
- **Local Development**: Add to `backend/.env`
  ```bash
  JWT_SECRET=<generated-128-char-hex-string>
  ```

- **Production (Railway)**:
  1. Go to Railway project → Variables
  2. Add `JWT_SECRET` with generated value
  3. Redeploy

- **Production (Vercel)**:
  1. Go to Project Settings → Environment Variables
  2. Add `JWT_SECRET` for Production environment
  3. Redeploy

**Minimum Requirements**:
- ✅ At least 64 characters (128 recommended)
- ✅ Cryptographically random (use the command above)
- ✅ Never commit to git
- ✅ Rotate every 90 days

---

### 3. Environment Variable Security 🚨

**Current Risk**: `backend/.env` contains exposed secrets and is potentially committed.

**Immediate Actions**:

1. **Remove from Git** (if committed):
   ```bash
   git rm --cached backend/.env
   git commit -m "Remove .env with exposed secrets"
   git push
   ```

2. **Verify .gitignore** (already configured ✅):
   ```
   .env
   .env.local
   .env.production
   backend/.env
   ```

3. **Rotate Compromised Secrets**:
   - Generate new `JWT_SECRET` (see above)
   - Create new Supabase service_role key:
     1. Supabase Dashboard → Settings → API
     2. Click "Reset service_role key"
     3. Update production secrets immediately
   - Update any other exposed API keys

4. **Production Secret Management**:

   **Railway**:
   - Use Railway Secrets (Project → Variables)
   - Secrets are encrypted at rest
   - Never include in Dockerfile or code

   **Vercel**:
   - Use Environment Variables (Project Settings)
   - Set per environment (Production, Preview, Development)
   - Encrypt sensitive values

5. **Remove DEFAULT_USER_PASSWORD**:
   - Delete `DEFAULT_USER_PASSWORD` from `backend/.env.example` (or mark as DEPRECATED)
   - Implement secure password generation:
     ```javascript
     const crypto = require('crypto');
     const tempPassword = crypto.randomBytes(16).toString('base64');
     // Send via secure channel (email, SMS) with forced reset
     ```

---

### 4. Database Migrations ✅

**Status**: All migrations in `backend/migrations/` ready to apply

**Apply Migrations** (in order):
```bash
cd backend

# List all migrations
ls migrations/*.sql | sort

# Apply each migration via Supabase SQL Editor
# Copy contents → Paste → Run
# OR use migration tool if available
```

**Required Migrations**:
1. Initial schema setup
2. Tenant isolation (tenant_id columns)
3. Audit logging tables
4. **999_enable_rls_policies.sql** (RLS - apply last)

**Verification**:
```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname='public';
```

---

### 5. CORS & Rate Limiting ✅

**Status**: Middleware configured, needs production domain update

**Update CORS** for production:

`backend/.env` (production):
```bash
ALLOWED_ORIGINS=https://yourcrm.com,https://www.yourcrm.com
```

**Verify Rate Limiting** in `backend/server.js`:
```javascript
const limiter = rateLimit({
  windowMs: process.env.API_RATE_LIMIT_WINDOW_MS || 60000, // 1 min
  max: process.env.API_RATE_LIMIT_MAX_REQUESTS || 100, // 100 req/min
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);
```

**Testing**:
- Send 101 requests within 1 minute → Should return 429 Too Many Requests
- Verify CORS headers in browser DevTools

---

### 6. Helmet.js Security Headers ✅

**Status**: Likely configured, verify in `backend/server.js`

**Check for**:
```javascript
import helmet from 'helmet';
app.use(helmet());
```

**Security Headers Provided**:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (HTTPS only)

**Verification**:
```bash
curl -I https://your-backend.railway.app/api/health
# Should include helmet security headers
```

---

### 7. Monitoring & Logging 📊

**Setup Recommendations**:

**Supabase Monitoring**:
- Enable logging in Supabase Dashboard → Logs
- Monitor API usage, errors, slow queries
- Set up automated backups (daily minimum)

**Application Monitoring**:
- **Sentry** for error tracking:
  ```bash
  npm install @sentry/node
  ```
  ```javascript
  import * as Sentry from '@sentry/node';
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  ```

- **LogRocket** for session replay (optional)
- **Datadog** or **New Relic** for APM (enterprise)

**Health Checks**:
- Endpoint: `GET /api/health`
- Monitor with UptimeRobot or Pingdom
- Alert on downtime > 2 minutes

**Audit Logging**:
- Already implemented in `backend/routes/tenants.js`
- Logs to `audit_log` table
- Monitor for suspicious activity

---

### 8. Secret Rotation Schedule 🔄

**Establish Regular Rotation**:

| Secret | Rotation Frequency | Process |
|--------|-------------------|---------|
| JWT_SECRET | Every 90 days | Generate new → Update platform secrets → Redeploy → Invalidate old JWTs |
| Supabase Service Role Key | Every 180 days | Supabase Dashboard → Reset → Update secrets → Redeploy |
| API Keys (Stripe, Twilio, etc.) | Per vendor policy | Vendor dashboard → Regenerate → Update secrets → Test |
| Database Credentials | Every 180 days | Supabase → Reset password → Update connection strings |

**Rotation Procedure**:
1. Generate new secret
2. Update staging environment first
3. Test thoroughly
4. Update production during low-traffic window
5. Monitor for errors
6. Invalidate/delete old secret after 24 hours

---

## 📋 Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] RLS policies applied and verified (`node apply-rls-policies.js`)
- [ ] JWT_SECRET generated (128 chars) and configured in platform secrets
- [ ] All Supabase keys rotated if previously exposed
- [ ] `backend/.env` removed from git history
- [ ] `.gitignore` includes `.env*` files
- [ ] DEFAULT_USER_PASSWORD removed or deprecated
- [ ] CORS `ALLOWED_ORIGINS` set to production domain(s)
- [ ] All database migrations applied in order
- [ ] Rate limiting configured (100 req/min default)
- [ ] Helmet.js security headers enabled
- [ ] Monitoring and logging configured (Sentry, Supabase logs)
- [ ] Automated database backups enabled in Supabase
- [ ] Health check endpoint monitored (UptimeRobot)
- [ ] Secret rotation schedule documented and planned

---

## 🚀 Deployment Steps

### Railway

1. **Create Project**:
   ```bash
   railway login
   railway init
   railway link
   ```

2. **Configure Environment Variables**:
   - Go to Railway project → Variables
   - Add all required secrets from `backend/.env.example`:
     - `NODE_ENV=production`
     - `JWT_SECRET=<generated-secret>`
     - `SUPABASE_URL=<your-url>`
     - `SUPABASE_SERVICE_ROLE_KEY=<your-key>`
     - `ALLOWED_ORIGINS=<production-domain>`
   - Add optional integration keys (Stripe, Twilio, etc.)

3. **Deploy Backend**:
   ```bash
   cd backend
   railway up
   ```

4. **Verify Deployment**:
   ```bash
   curl https://your-app.railway.app/api/health
   ```

### Vercel (Frontend)

1. **Create Project**:
   ```bash
   vercel login
   vercel
   ```

2. **Configure Environment Variables**:
   - Project Settings → Environment Variables
   - Add for Production environment:
     - `VITE_AISHACRM_BACKEND_URL=<railway-backend-url>`
     - `VITE_SUPABASE_URL=<your-supabase-url>`
     - `VITE_SUPABASE_ANON_KEY=<your-anon-key>`

3. **Deploy**:
   ```bash
   vercel --prod
   ```

---

## 🔍 Post-Deployment Verification

After deployment, verify:

1. **Backend Health**:
   ```bash
   curl https://your-backend.railway.app/api/health
   # Should return: {"status":"ok","timestamp":"..."}
   ```

2. **RLS Working**:
   - Try direct database query with anon key → Should return no data
   - API requests via backend → Should work normally

3. **CORS**:
   - Access frontend at production URL
   - Check browser console for CORS errors (should be none)

4. **Rate Limiting**:
   - Send 101 requests rapidly
   - 101st request should return 429

5. **Monitoring**:
   - Check Sentry for error reports
   - Verify Supabase logs are collecting data
   - Confirm health check monitor is reporting uptime

---

## 🆘 Security Incident Response

If secrets are compromised:

1. **Immediate Actions** (within 1 hour):
   - Rotate compromised secrets (JWT, Supabase keys, API keys)
   - Invalidate all active user sessions
   - Enable additional logging/monitoring

2. **Investigation** (within 24 hours):
   - Review `audit_log` table for suspicious activity
   - Check Supabase logs for unauthorized access attempts
   - Identify scope of compromise

3. **Remediation**:
   - Apply additional security measures (IP whitelist, stricter RLS)
   - Notify affected users if data breach occurred
   - Document incident and lessons learned

4. **Prevention**:
   - Implement secret scanning in CI/CD (git-secrets, truffleHog)
   - Regular security audits (quarterly)
   - Team training on secret management

---

## 📞 Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Railway Docs**: https://docs.railway.app
- **Vercel Docs**: https://vercel.com/docs
- **OWASP Top 10**: https://owasp.org/www-project-top-ten/

For questions, contact: [Your support email]
