# Railway CLI Local Development Setup

## 🎯 Why Use Railway CLI Locally?

**Major Benefits:**
1. ✅ **Test with production env vars** - Use your Railway environment variables locally
2. ✅ **Debug before deploying** - Catch issues on your machine, not in production
3. ✅ **Faster iteration** - No need to push/wait for Railway to see changes
4. ✅ **Match production exactly** - Same env vars, same Docker setup
5. ✅ **Preview deployments** - Test PRs with temporary Railway environments
6. ✅ **Database access** - Connect to your Railway/Supabase DB from local code

## 📦 Installation

### Install Railway CLI

**Windows (PowerShell):**
```powershell
# Using Scoop (recommended)
scoop install railway

# Or using npm
npm install -g @railway/cli

# Verify installation
railway --version
```

**Alternative methods:**
- Download installer: https://railway.app/cli
- Or use Chocolatey: `choco install railway`

## 🔐 Authentication

### 1. Login to Railway

```powershell
# Login (opens browser)
railway login

# Verify you're logged in
railway whoami
```

### 2. Link Your Project

```powershell
# Navigate to your project root
cd C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53

# Link to your Railway project
railway link

# Or if you know your project ID
railway link <project-id>

# Verify link
railway status
```

## 🚀 Local Development Workflows

### Option 1: Run with Railway Environment Variables (Recommended)

This runs your code **locally** but uses **Railway's environment variables**.

**Backend:**
```powershell
# Start backend with Railway env vars
cd backend
railway run npm run dev

# Or for production mode
railway run npm start
```

**Frontend:**
```powershell
# Start frontend with Railway env vars
railway run npm run dev

# Access at http://localhost:5173
```

**Full Stack:**
```powershell
# Run start script with Railway env vars
railway run .\start-all.ps1
```

### Option 2: Docker with Railway Variables

```powershell
# Build and run with Railway env vars injected
railway run docker-compose up --build

# Or specific service
railway run docker build -t backend ./backend
railway run docker run -p 3001:3001 backend
```

### Option 3: Shell with Railway Environment

```powershell
# Open a shell with all Railway env vars loaded
railway shell

# Now any command you run has access to Railway env vars
npm run dev
node backend/server.js
./start-all.ps1
```

## 🎨 Development Patterns

### Pattern 1: Local Code + Railway Database

**Best for:** Day-to-day development

```powershell
# Backend connects to Railway/Supabase DB
cd backend
railway run npm run dev

# Frontend connects to local backend
npm run dev
```

**Why:** Fast frontend dev, real database for testing.

### Pattern 2: Full Local with Docker

**Best for:** Testing deployment setup

```powershell
# Use local PostgreSQL + local services
docker-compose up --build

# Or with Railway env vars for Supabase
railway run docker-compose up --build
```

**Why:** Test exact production setup locally.

### Pattern 3: Hybrid (Local Backend + Railway Frontend)

**Best for:** Testing API changes before deploying

```powershell
# Backend local
cd backend
railway run npm run dev

# Frontend from Railway staging
# Just visit your Railway URL
```

## 📊 Useful Railway CLI Commands

### Environment Variables

```powershell
# View all environment variables for current service
railway variables

# Set a new variable
railway variables set KEY=value

# Delete a variable
railway variables delete KEY

# Pull variables to .env file (don't commit!)
railway variables --env > .env.railway
```

### Deployments

```powershell
# Deploy current directory
railway up

# Deploy with specific Dockerfile
railway up --dockerfile Dockerfile

# View deployment logs
railway logs

# Follow logs in real-time
railway logs -f

# View logs for specific deployment
railway logs <deployment-id>
```

### Services

```powershell
# List all services in project
railway service list

# Switch between services (frontend/backend)
railway service

# Link to specific service
railway service link <service-id>
```

### Database

```powershell
# Connect to Railway PostgreSQL database
railway connect postgres

# Or if using Supabase, just use the connection string
railway variables | grep DATABASE_URL
```

### Domains & URLs

```powershell
# View service domains
railway domain

# Open current service in browser
railway open
```

## 🔧 Recommended Setup

### 1. Create Service-Specific Links

```powershell
# In backend folder
cd backend
railway link
# Select your backend service

# In root (for frontend)
cd ..
railway link
# Select your frontend service
```

Now each directory is linked to its respective Railway service!

### 2. Add npm Scripts (Optional)

**package.json:**
```json
{
  "scripts": {
    "dev": "vite",
    "dev:railway": "railway run vite",
    "build:railway": "railway run npm run build",
    "start:railway": "railway run npm start"
  }
}
```

**backend/package.json:**
```json
{
  "scripts": {
    "dev": "nodemon server.js",
    "dev:railway": "railway run nodemon server.js",
    "start:railway": "railway run npm start"
  }
}
```

### 3. .gitignore Railway Files

Already covered in your `.gitignore`:
```gitignore
.env
.env.local
.env.railway
```

## 🎯 Common Use Cases

### Test Production Environment Variables Locally

```powershell
# Check if DATABASE_URL connects
railway run node -e "console.log(process.env.DATABASE_URL)"

# Test backend with production DB
railway run npm run dev
```

### Debug Railway Deployment Issues

```powershell
# View recent logs
railway logs --tail 100

# Follow logs
railway logs -f

# View specific deployment
railway logs <deployment-id>
```

### Test Docker Build Before Pushing

```powershell
# Build with Railway context
railway run docker build -t test-backend ./backend

# Run to test
railway run docker run -p 3001:3001 test-backend

# Test health endpoint
curl http://localhost:3001/health
```

### Quick Database Query

```powershell
# Get database URL
railway variables | Select-String DATABASE_URL

# Or connect directly (if Railway Postgres)
railway connect postgres

# For Supabase, use psql with the URL
railway shell
# Then: psql $DATABASE_URL
```

## 🐛 Troubleshooting

### "railway: command not found"

**Fix:**
```powershell
# Reinstall Railway CLI
npm install -g @railway/cli

# Or use Scoop
scoop install railway

# Add to PATH if needed
$env:Path += ";C:\Users\andre\AppData\Roaming\npm"
```

### "Not linked to a project"

**Fix:**
```powershell
railway link
# Select your project and service
```

### "No environment variables"

**Fix:**
```powershell
# Ensure you're linked to correct service
railway status

# Switch service if needed
railway service
```

### Environment Variables Not Loading

**Fix:**
```powershell
# Use railway shell instead
railway shell
npm run dev
```

## 📋 Quick Reference

| Command | Purpose |
|---------|---------|
| `railway login` | Authenticate |
| `railway link` | Link project/service |
| `railway run <cmd>` | Run command with Railway env |
| `railway shell` | Shell with Railway env |
| `railway variables` | List env vars |
| `railway logs -f` | Stream logs |
| `railway status` | Show project/service info |
| `railway up` | Deploy current directory |
| `railway open` | Open service in browser |

## 🎁 Pro Tips

1. **Service-specific directories:**
   ```powershell
   # Link backend folder to backend service
   cd backend && railway link
   
   # Link root to frontend service
   cd .. && railway link
   ```

2. **Quick environment check:**
   ```powershell
   # See all env vars
   railway variables
   
   # Save to file (don't commit!)
   railway variables > railway-env.txt
   ```

3. **Local + Production hybrid:**
   ```powershell
   # Backend with Railway DB
   cd backend && railway run npm run dev
   
   # Frontend local (separate terminal)
   npm run dev
   ```

4. **Test before deploy:**
   ```powershell
   # Build Docker image locally
   railway run docker build -t test .
   
   # If it works, push to deploy
   git push origin main
   ```

## 🚦 Recommended Workflow

### Daily Development

```powershell
# Morning:
railway login  # If session expired
railway status  # Verify link

# Development:
cd backend
railway run npm run dev  # Backend with real DB

# Separate terminal:
npm run dev  # Frontend

# Before committing:
railway run docker-compose up --build  # Test full stack
```

### Before Deploying

```powershell
# 1. Test locally with Railway env
railway run .\start-all.ps1

# 2. Test Docker build
railway run docker build -t test-backend ./backend
railway run docker build -t test-frontend .

# 3. If tests pass, deploy
git add .
git commit -m "Your changes"
git push origin main

# 4. Watch logs
railway logs -f
```

---

## ✨ Summary

**Yes, absolutely set up Railway CLI locally!**

**Install:**
```powershell
npm install -g @railway/cli
railway login
railway link
```

**Daily use:**
```powershell
# Run with production env vars
railway run npm run dev

# Or get a shell
railway shell
```

**Benefits:**
- ✅ Test with real environment variables
- ✅ Debug before deploying
- ✅ Connect to production database
- ✅ View live logs
- ✅ Fast iteration

**Next steps:** Install Railway CLI and link your project!
