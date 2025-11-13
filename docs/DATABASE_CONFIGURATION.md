# 🔴 CRITICAL: Database Configuration

## PRIMARY DATABASE: SUPABASE CLOUD ONLY

**DATE ESTABLISHED:** November 7, 2025

### ⚠️ MANDATORY RULES

1. **ALL database operations MUST use Supabase Cloud**
   - Backend connects via `DATABASE_URL` pointing to Supabase
   - NO local PostgreSQL usage for production/development data
   - Local `aishacrm-db` container is DISABLED

2. **Before ANY database changes:**
   - ✅ Verify connection is to Supabase Cloud (`*.supabase.co`)
   - ✅ Run migrations in Supabase SQL Editor
   - ✅ Test table existence in Supabase dashboard
   - ❌ DO NOT create tables in local Docker PostgreSQL
   - ❌ DO NOT assume migrations run automatically

3. **Current Configuration:**
   ```
   DATABASE_URL=postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres
   USE_SUPABASE_PROD=true
   SUPABASE_URL=https://ehjlenywplgyiahgxkfj.supabase.co
   ```

4. **Local PostgreSQL Status:**
   - Container: `aishacrm-db` - **STOPPED/DISABLED**
   - Purpose: Migration testing only (if needed)
   - **NOT used for application data**

### 📋 Checklist for Database Work

Before modifying/querying database:
- [ ] Confirm you're looking at Supabase Cloud dashboard
- [ ] Check table exists in Supabase (not local Docker)
- [ ] Verify `DATABASE_URL` points to `*.supabase.co`
- [ ] Run migrations via Supabase SQL Editor

### 🚨 Common Mistakes to Avoid

1. ❌ Running migrations in local Docker and expecting Supabase to have them
2. ❌ Creating tables locally and wondering why backend can't find them
3. ❌ Checking local PostgreSQL when debugging "table does not exist" errors
4. ❌ Assuming `docker-entrypoint-initdb.d` migrations apply to Supabase

### ✅ Correct Workflow

1. **For new tables/migrations:**
   - Open Supabase SQL Editor
   - Paste migration SQL
   - Execute in Supabase
   - Verify in Supabase Table Editor

2. **For debugging:**
   - Check Supabase dashboard first
   - Use Supabase SQL Editor for queries
   - Never check local PostgreSQL unless explicitly testing migrations

3. **For connection issues:**
   - Verify `DATABASE_URL` in `backend/.env`
   - Check Supabase project is not paused
   - Verify credentials are current

---

**Last Updated:** November 7, 2025  
**Maintained By:** Development Team  
**Review Frequency:** On every database-related issue
