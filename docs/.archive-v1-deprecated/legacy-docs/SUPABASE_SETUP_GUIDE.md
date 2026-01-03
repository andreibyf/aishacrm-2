# Supabase Setup Guide

> **Version 2.0** | Consolidated: December 4, 2025  
> Consolidates: `SUPABASE_CLOUD_SETUP.md`, `SUPABASE_SETUP_GUIDE.md`

## Overview

This guide covers complete Supabase setup for Aisha CRM, including local development configurations and production cloud setup.

---

## Quick Start Checklist

- [ ] Create Supabase project (or use existing)
- [ ] Configure environment variables
- [ ] Run database migrations
- [ ] Enable Row Level Security (RLS)
- [ ] Create initial tenant and admin user
- [ ] Test connection from backend

---

## 1. Project Creation

### Option A: Supabase Cloud (Production)

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Select organization
4. Configure:
   - **Project name**: `aishacrm-prod` (or your preference)
   - **Database password**: Generate strong password (save securely!)
   - **Region**: Choose closest to your users
   - **Pricing plan**: Pro recommended for production
5. Wait for project provisioning (~2 minutes)

### Option B: Local Development (Docker)

Aisha CRM uses Supabase Cloud even for development. Local Supabase is not required but can be set up:

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize local project
supabase init

# Start local instance
supabase start
```

---

## 2. Environment Configuration

### Backend `.env` Variables

```bash
# Supabase Connection (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Direct Database Connection (Optional - for migrations)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# System Tenant (Required)
SYSTEM_TENANT_ID=a11dfb63-4b18-4eb8-872e-747af2e37c46
```

### Frontend `.env` Variables

```bash
# Supabase Client (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Finding Your Keys

1. Go to Supabase Dashboard → **Settings** → **API**
2. Copy:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (backend only!)

> ⚠️ **NEVER expose service_role key to frontend or commit to Git**

---

## 3. Database Migrations

### Running Migrations

```bash
cd backend

# Apply all migrations
node apply-supabase-migrations.js

# Or apply single migration
node apply-single-sql.js migrations/082_create_documents_table.sql
```

### Migration Directory Structure

```
backend/migrations/
├── 001_initial_schema.sql
├── 002_create_tenants.sql
├── ...
├── 088_workflow_execution_indexes.sql
└── 089_create_documents_table.sql
```

### Migration Best Practices

1. **Never modify existing migrations** - create new ones
2. **Test migrations locally first** - use Supabase SQL Editor
3. **Include rollback comments** - document how to undo
4. **Version numbering** - use sequential 3-digit prefixes

---

## 4. Row Level Security (RLS)

Aisha CRM uses RLS extensively for multi-tenant isolation.

### RLS Overview

- **50+ tables** have RLS enabled
- **Policies based on `tenant_id`** (UUID column)
- **Service role bypasses RLS** - use carefully

### Applying RLS Policies

```bash
cd backend
node apply-rls-policies.js
```

### Common RLS Pattern

```sql
-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY "tenant_isolation" ON accounts
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Service role bypass (already handled by Supabase)
```

### Verifying RLS

```bash
cd backend
node check-rls-simple.js
```

---

## 5. Initial Data Setup

### Create System Tenant

```sql
INSERT INTO tenants (id, name, slug, is_active)
VALUES (
  'a11dfb63-4b18-4eb8-872e-747af2e37c46',
  'System Tenant',
  'system',
  true
);
```

### Create Admin User

See `SUPABASE_AUTH_GUIDE.md` for complete user creation process.

Quick version:
```bash
cd backend
node create-test-user.js
```

---

## 6. Connection Pooling

### Pooler Configuration

Supabase provides built-in connection pooling via Supavisor.

**Pooler URL Format:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Direct URL Format (for migrations):**
```
postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

### When to Use Each

| Connection Type | Use Case |
|----------------|----------|
| Pooler (port 6543) | Application queries, high concurrency |
| Direct (port 5432) | Migrations, schema changes |

---

## 7. Production Configuration

### Recommended Settings

**Database → Settings → Database:**
- Connection pooling: **Transaction** mode
- Pool size: **15-25** for Pro plan

**Authentication → Settings:**
- Site URL: Your production frontend URL
- Redirect URLs: Add all valid redirect URLs

**API → Settings:**
- Rate limiting: Enable for production

### Security Checklist

- [ ] Strong database password (32+ characters)
- [ ] Service role key only in backend (never frontend)
- [ ] RLS enabled on all tenant tables
- [ ] SSL enforced for connections
- [ ] Backup schedule configured
- [ ] Monitoring alerts set up

---

## 8. Troubleshooting

### Common Issues

**Connection refused:**
```bash
# Check if Supabase project is paused
# Go to Dashboard → Project Settings → Pause compute
```

**RLS policy blocking queries:**
```sql
-- Check current tenant context
SELECT current_setting('app.tenant_id', true);

-- Temporarily disable for debugging (use service role)
```

**Migration fails:**
```bash
# Check for syntax errors
# Run SQL directly in Supabase SQL Editor first
```

**Slow queries:**
```sql
-- Check for missing indexes
EXPLAIN ANALYZE SELECT * FROM your_query;
```

### Useful Diagnostic Queries

```sql
-- List all tables with RLS status
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- View recent errors
SELECT * FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start DESC;
```

---

## 9. Backup & Recovery

### Automatic Backups

Supabase Pro includes:
- Point-in-time recovery (7 days)
- Daily backups

### Manual Backup

```bash
# Export schema and data
pg_dump -h db.[project-ref].supabase.co -U postgres -d postgres > backup.sql
```

### Restore

```bash
# Restore to database
psql -h db.[project-ref].supabase.co -U postgres -d postgres < backup.sql
```

---

## Related Documentation

- `SUPABASE_AUTH_GUIDE.md` - Authentication setup and testing
- `AISHA_CRM_DATABASE_MANUAL_PART1.md` - Complete schema documentation
- `DATABASE_UUID_vs_TENANT_ID.md` - Tenant identification patterns

---

*Last Updated: December 4, 2025*
