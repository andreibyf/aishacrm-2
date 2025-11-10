# Environment Files Reference

## ⚠️ CRITICAL: Only Two .env Files Exist

This project uses **EXACTLY TWO** environment files. Do not create or reference any others.

---

## 📁 File Locations

### 1. Root `.env` (Frontend)
**Location:** `c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53\.env`

**Purpose:** Frontend-only environment variables for Vite

**Key Variables:**
- `VITE_AISHACRM_BACKEND_URL=http://localhost:4001` (Docker backend URL)
- All frontend variables MUST start with `VITE_` prefix to be accessible

**Used By:**
- Vite dev server
- Frontend Docker container
- All React components (accessed via `import.meta.env.VITE_*`)

**Loading:** Automatically loaded by Vite

---

### 2. Backend `.env` (Backend)
**Location:** `c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53\backend\.env`

**Purpose:** Backend-only environment variables for Node.js Express server

**Key Variables:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (admin access)
- `SUPABASE_STORAGE_BUCKET` - Storage bucket name
- `USE_SUPABASE_PROD=true` - Use Supabase SDK (not direct PostgreSQL)
- `ALLOWED_ORIGINS` - CORS origins (includes `http://localhost:4000`)
- `FRONTEND_URL=http://localhost:4000` - Frontend URL for redirects
- `DATABASE_URL` - **Usually COMMENTED OUT** (using Supabase SDK instead)

**Used By:**
- Backend Express server
- Backend Docker container
- All backend routes and middleware
- Database migration scripts (when uncommented)

**Loading:** Explicitly loaded with `dotenv.config({ path: 'backend/.env' })`

---

## 🚫 Files That DO NOT Exist

**NEVER reference these files - they are not part of this project:**
- `.env.local`
- `.env.production`
- `.env.development`
- `.env.test`
- `backend/.env.local`
- Any other `.env` variants

---

## 📝 Common Use Cases

### Running Frontend (Docker)
```powershell
# Uses root .env automatically
docker-compose up -d --build frontend
```

### Running Backend (Docker)
```powershell
# Uses backend/.env automatically
docker-compose up -d --build backend
```

### Backend Scripts
```javascript
// CORRECT: Load backend/.env
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
// Now process.env has backend variables
```

```javascript
// WRONG: Do not reference .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') }); // ❌ This file doesn't exist!
```

### Database Migrations
```powershell
# Option 1: Manual (RECOMMENDED)
# Go to Supabase Dashboard → SQL Editor → Run SQL

# Option 2: Automated (only if DATABASE_URL is uncommented in backend/.env)
node backend/apply-supabase-migrations.js
```

---

## 🔍 Quick Troubleshooting

### "Cannot find .env.local"
✅ **Fix:** Change to use `backend/.env` instead

### "Environment variable not defined"
✅ **Check:**
1. Are you loading the correct .env file?
2. Frontend variables must start with `VITE_`
3. Backend variables are loaded from `backend/.env`

### "DATABASE_URL not found"
✅ **Reason:** It's commented out in `backend/.env` because the project uses Supabase SDK
✅ **Solution:** Use Supabase Dashboard for migrations, or uncomment if needed

---

## 📌 Summary

| File | Location | Used For | Loaded By |
|------|----------|----------|-----------|
| `.env` | Root directory | Frontend (Vite) | Vite automatically |
| `.env` | `backend/` directory | Backend (Express) | `dotenv.config()` |

**Remember:** Only these two files exist. Never create or reference others.
