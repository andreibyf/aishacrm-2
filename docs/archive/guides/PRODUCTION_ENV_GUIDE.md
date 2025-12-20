# Production Environment Variables Guide

## 🚀 How to Deploy with Environment Variables in Production

### Option 1: Platform Environment Variables (Recommended for PaaS)

**Best for:** Railway, Render, Vercel, Heroku, AWS Elastic Beanstalk, Google Cloud Run

#### Setup Steps:

1. **Add Environment Variables in Platform UI:**
   ```
   # Supabase Configuration
   VITE_SUPABASE_URL=https://efzqxjpfewkrgpdootte.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_6AFc_XdEzOF0SAE6ivUL2A_fpdZZdBq
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_TEMOH-6ussfhYOelUYG-iQ_lBmInIki
   
   # Backend Configuration
   VITE_AISHACRM_BACKEND_URL=https://your-backend-domain.com
   ALLOWED_ORIGINS=https://your-frontend-domain.com
   FRONTEND_URL=https://your-frontend-domain.com
   
   # JWT Secrets (generate with: openssl rand -hex 32)
   JWT_ACCESS_SECRET=your-generated-secret-here
   JWT_REFRESH_SECRET=your-generated-secret-here
   
   # System Configuration
   NODE_ENV=production
   SYSTEM_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
   VITE_USER_HEARTBEAT_INTERVAL_MS=90000
   ```

2. **Deploy:** The platform automatically injects these during build and runtime

3. **Verify:** Check logs for "Missing credentials" - should be gone

**Benefits:**
- ✅ No `.env` file in repo (secure)
- ✅ Easy to update without redeploying
- ✅ Different values per environment

---

### Option 2: Docker Compose with Host Environment Variables

**Best for:** VPS, Dedicated Server, Cloud VM (DigitalOcean, Linode, AWS EC2)

#### Setup Steps:

1. **Create `.env.production` on server (NEVER commit to git):**
   ```bash
   # SSH into your server
   ssh user@your-server.com
   cd /opt/aishacrm
   
   # Create production env file
   cat > .env.production << 'EOF'
   # Supabase
   VITE_SUPABASE_URL=https://efzqxjpfewkrgpdootte.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_6AFc_XdEzOF0SAE6ivUL2A_fpdZZdBq
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_TEMOH-6ussfhYOelUYG-iQ_lBmInIki
   SUPABASE_ANON_KEY=sb_publishable_6AFc_XdEzOF0SAE6ivUL2A_fpdZZdBq
   
   # Backend
   VITE_AISHACRM_BACKEND_URL=https://api.yourdomain.com
   ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   FRONTEND_URL=https://yourdomain.com
   
   # JWT (generate new secrets!)
   JWT_ACCESS_SECRET=$(openssl rand -hex 32)
   JWT_REFRESH_SECRET=$(openssl rand -hex 32)
   
   # System
   NODE_ENV=production
   SYSTEM_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
   ALLOW_PRODUCTION_WRITES=true
   EOF
   
   # Secure the file
   chmod 600 .env.production
   ```

2. **Update docker-compose.prod.yml to use it:**
   ```yaml
   services:
     backend:
       env_file:
         - .env.production
     
     frontend:
       env_file:
         - .env.production
   ```

3. **Deploy:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --build
   ```

**Benefits:**
- ✅ Full control over environment
- ✅ Easy to edit on server
- ✅ Works with any Docker host

---

### Option 3: Runtime Injection (Current Method)

**Best for:** Static hosting (Netlify, Cloudflare Pages, Vercel static)

Your `frontend-entrypoint.sh` already supports this! It creates `env-config.js` at runtime.

#### How It Works:

1. **Build time:** Frontend is built as static files
2. **Runtime:** Container starts, `frontend-entrypoint.sh` runs:
   ```bash
   cat > /app/dist/env-config.js << EOF
   window._env_ = {
     VITE_SUPABASE_URL: "${VITE_SUPABASE_URL}",
     VITE_SUPABASE_ANON_KEY: "${VITE_SUPABASE_ANON_KEY}",
     ...
   };
   EOF
   ```
3. **App reads:** `src/lib/supabase.js` reads from `window._env_`

#### Usage:
```bash
# Set env vars on host
export VITE_SUPABASE_URL=https://efzqxjpfewkrgpdootte.supabase.co
export VITE_SUPABASE_ANON_KEY=sb_publishable_...

# Run container
docker run -e VITE_SUPABASE_URL -e VITE_SUPABASE_ANON_KEY \
  -p 4000:3000 aishacrm-frontend
```

**Benefits:**
- ✅ No rebuild needed to change env vars
- ✅ Same image works in multiple environments
- ✅ Platform-agnostic

---

## 🔒 Security Best Practices

### DO:
- ✅ Use platform environment variables when possible
- ✅ Generate unique JWT secrets per environment
- ✅ Restrict `.env` file permissions to `600` (owner read/write only)
- ✅ Use different Supabase projects for dev/staging/prod
- ✅ Add `.env.production` to `.gitignore`
- ✅ Use Supabase RLS (Row Level Security) policies
- ✅ Rotate secrets regularly

### DON'T:
- ❌ Commit `.env` files to git
- ❌ Use the same JWT secrets in dev and prod
- ❌ Use `SUPABASE_SERVICE_ROLE_KEY` in frontend (backend only!)
- ❌ Share production credentials in chat/email
- ❌ Use default/placeholder secrets in production

---

## 🛠️ Deployment Examples

### Railway (Easiest):
```bash
# 1. Push to GitHub
git push origin main

# 2. Connect repo to Railway
# 3. Add environment variables in Railway UI
# 4. Railway auto-deploys on push

# Variables to set in Railway:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_AISHACRM_BACKEND_URL (Railway provides this)
# - JWT_ACCESS_SECRET
# - JWT_REFRESH_SECRET
# - SUPABASE_SERVICE_ROLE_KEY
```

### DigitalOcean Droplet:
```bash
# 1. SSH into droplet
ssh root@your-droplet-ip

# 2. Clone repo
git clone https://github.com/andreibyf/aishacrm-2.git /opt/aishacrm
cd /opt/aishacrm

# 3. Create .env.production (see Option 2 above)
nano .env.production

# 4. Deploy
docker-compose -f docker-compose.prod.yml up -d

# 5. Setup Nginx reverse proxy
# 6. Configure SSL with Let's Encrypt
```

### AWS ECS/Fargate:
```bash
# 1. Store secrets in AWS Secrets Manager or Parameter Store
aws secretsmanager create-secret \
  --name aishacrm/supabase-url \
  --secret-string "https://efzqxjpfewkrgpdootte.supabase.co"

# 2. Reference in ECS task definition
{
  "secrets": [
    {
      "name": "VITE_SUPABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:region:account:secret:aishacrm/supabase-url"
    }
  ]
}

# 3. Deploy with CloudFormation or Terraform
```

---

## 🧪 Testing Production Config Locally

```bash
# 1. Create test env file
cp .env .env.prod-test

# 2. Edit with production-like values
nano .env.prod-test

# 3. Test locally
docker-compose --env-file .env.prod-test -f docker-compose.prod.yml up

# 4. Verify at http://localhost:4000
```

---

## 📋 Required Environment Variables

### Frontend (Build Args + Runtime):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...  # Public key, safe for frontend
VITE_AISHACRM_BACKEND_URL=https://api.yourdomain.com
VITE_CURRENT_BRANCH=production
VITE_SYSTEM_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
VITE_USER_HEARTBEAT_INTERVAL_MS=90000
```

### Backend (Runtime Only):
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # SECRET! Backend only, never frontend
SUPABASE_ANON_KEY=eyJhbG...

# JWT
JWT_ACCESS_SECRET=your-secure-random-32-byte-hex
JWT_REFRESH_SECRET=your-secure-random-32-byte-hex

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# System
NODE_ENV=production
SYSTEM_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
ALLOW_PRODUCTION_WRITES=true

# Redis
REDIS_URL=redis://redis-memory:6379
REDIS_CACHE_URL=redis://redis-cache:6379
```

---

## 🚨 Troubleshooting

### "Missing credentials" error in production:
1. Check container env vars: `docker exec aishacrm-frontend env | grep VITE`
2. Verify `/app/dist/env-config.js` exists: `docker exec aishacrm-frontend cat /app/dist/env-config.js`
3. Check browser console for `window._env_`

### Build fails with "VITE_SUPABASE_URL is not defined":
1. Ensure build args are passed in `docker-compose.prod.yml`
2. Set them on host before building: `export VITE_SUPABASE_URL=...`
3. Or use `--build-arg`: `docker build --build-arg VITE_SUPABASE_URL=...`

### Different env vars in dev vs prod:
- **Dev:** Uses `.env` file (committed with placeholders)
- **Prod:** Uses platform env vars or `.env.production` (NOT committed)

---

## 📚 Additional Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Docker Secrets](https://docs.docker.com/engine/swarm/secrets/)
- [Railway Environment Variables](https://docs.railway.app/guides/variables)
- [Twelve-Factor App Config](https://12factor.net/config)
