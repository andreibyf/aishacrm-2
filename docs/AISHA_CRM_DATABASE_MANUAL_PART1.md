# Aisha CRM Database Administration Manual - Part 1

**Version:** 1.0  
**Last Updated:** November 15, 2025  
**Audience:** Database Administrators, DevOps Engineers, System Administrators

---

## Table of Contents

### Part 1: Architecture & Setup

#### Chapter 1: Database Architecture
- [1.1 Architecture Overview](#11-architecture-overview)
- [1.2 Technology Stack](#12-technology-stack)
- [1.3 Supabase vs Self-Hosted](#13-supabase-vs-self-hosted)
- [1.4 Connection Architecture](#14-connection-architecture)

#### Chapter 2: Initial Setup
- [2.1 Supabase Setup](#21-supabase-setup)
- [2.2 Database Configuration](#22-database-configuration)
- [2.3 Connection Strings](#23-connection-strings)
- [2.4 Environment Variables](#24-environment-variables)

#### Chapter 3: Schema Design
- [3.1 Core Tables](#31-core-tables)
- [3.2 Entity Relationships](#32-entity-relationships)
- [3.3 Tenant Architecture](#33-tenant-architecture)
- [3.4 Metadata Pattern](#34-metadata-pattern)
- [3.5 Naming Conventions](#35-naming-conventions)

#### Chapter 4: Migrations Management
- [4.1 Migration Strategy](#41-migration-strategy)
- [4.2 Migration Files](#42-migration-files)
- [4.3 Applying Migrations](#43-applying-migrations)
- [4.4 Rollback Procedures](#44-rollback-procedures)
- [4.5 Migration History](#45-migration-history)

#### Chapter 5: Indexing Strategy
- [5.1 Index Types](#51-index-types)
- [5.2 Primary Indexes](#52-primary-indexes)
- [5.3 Foreign Key Indexes](#53-foreign-key-indexes)
- [5.4 Performance Indexes](#54-performance-indexes)
- [5.5 Index Maintenance](#55-index-maintenance)

#### Chapter 6: Data Integrity
- [6.1 Constraints](#61-constraints)
- [6.2 Foreign Keys](#62-foreign-keys)
- [6.3 Unique Constraints](#63-unique-constraints)
- [6.4 Check Constraints](#64-check-constraints)
- [6.5 Triggers](#65-triggers)

---

## Chapter 1: Database Architecture

### 1.1 Architecture Overview

Aisha CRM uses a **PostgreSQL 15+ database** hosted on **Supabase** with the following architecture:

```mermaid
graph TB
    subgraph "Application Layer"
        A[Frontend React App]
        B[Backend Express API]
    end
    
    subgraph "Supabase Platform"
        C[PostgREST API]
        D[PostgreSQL 15+]
        E[Storage]
        F[Auth]
    end
    
    subgraph "Database Features"
        G[Row-Level Security]
        H[Triggers & Functions]
        I[Indexes]
        J[JSONB Columns]
    end
    
    A -->|Anon Key| C
    B -->|Service Role| D
    D --> G
    D --> H
    D --> I
    D --> J
```

**Key Characteristics:**

- **Multi-Tenant:** UUID-based tenant isolation
- **UUID Primary Keys:** All tables use `gen_random_uuid()`
- **JSONB Metadata:** Flexible schema via `metadata` columns
- **Audit Logging:** Comprehensive change tracking
- **RLS Enabled:** 48+ tables with row-level security

---

### 1.2 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Database** | PostgreSQL | 15+ | Core data storage |
| **Hosting** | Supabase | Cloud | Managed PostgreSQL + extras |
| **Connection Pool** | pg (node-postgres) | 8.x | Backend connection pooling |
| **Extensions** | pgcrypto | - | UUID generation |
| **Extensions** | pg_stat_statements | - | Query performance tracking |
| **Data Types** | JSONB | - | Flexible metadata storage |
| **Security** | Row-Level Security (RLS) | - | Tenant isolation |

---

### 1.3 Supabase vs Self-Hosted

#### Why Supabase?

| Feature | Supabase | Self-Hosted PostgreSQL |
|---------|----------|----------------------|
| **Setup Time** | 5 minutes | Several hours |
| **Backups** | Automated daily | Manual configuration |
| **Auth Integration** | Built-in | Requires custom solution |
| **Storage** | Included | Requires separate service |
| **RLS** | UI + SQL | SQL only |
| **Monitoring** | Dashboard included | Requires setup (Grafana, etc.) |
| **Scaling** | Automatic | Manual |
| **SSL/TLS** | Included | Manual certificate management |
| **Cost (small)** | Free tier available | Server + maintenance costs |

**Decision: Supabase Cloud Only**

🚨 **CRITICAL:** As of November 7, 2025, Aisha CRM uses **Supabase Cloud exclusively**. Local PostgreSQL containers are disabled.

---

### 1.4 Connection Architecture

#### Backend Connection (Service Role)

```javascript
import pg from 'pg';

const { Pool } = pg;

export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000
});

// Test connection
pgPool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pgPool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});
```

**Connection String Format:**
```
postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
```

#### Frontend Connection (Anon Key)

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    }
  }
);
```

**Key Differences:**

| Aspect | Backend (Service Role) | Frontend (Anon Key) |
|--------|----------------------|-------------------|
| **Access Level** | Full database access | RLS-restricted access |
| **Bypasses RLS** | Yes | No |
| **Use Case** | API operations | Direct client queries (optional) |
| **Security** | Server-side only | Can be exposed |

---

## Chapter 2: Initial Setup

### 2.1 Supabase Setup

#### Creating a Supabase Project

1. **Sign Up/Login**
   - Go to https://supabase.com
   - Create account or sign in with GitHub

2. **Create New Project**
   ```
   Organization: Your Company
   Project Name: aishacrm-prod (or aishacrm-dev)
   Database Password: <generate strong password>
   Region: Choose closest to your users
   Pricing Plan: Free (for development) or Pro (for production)
   ```

3. **Wait for Provisioning** (~2 minutes)
   - PostgreSQL database created
   - Storage buckets initialized
   - Auth service enabled
   - API endpoints generated

4. **Note Credentials**
   - Project URL: `https://PROJECT_ID.supabase.co`
   - Anon (public) key: `eyJhbGc...` (safe for frontend)
   - Service role key: `eyJhbGc...` (keep secret!)
   - Database password: (from step 2)

---

### 2.2 Database Configuration

#### Supabase Dashboard Configuration

1. **Settings → Database**
   - Connection Pooling: Enabled
   - Max Connections: 100 (Free tier) / 500+ (Pro)
   - Pooler Mode: Transaction

2. **Settings → API**
   - Auto Schema Detection: Enabled
   - Max Rows: 1000 (adjust based on needs)

3. **Database → Extensions** (Enable these)
   - ✅ `pgcrypto` - UUID generation
   - ✅ `pg_stat_statements` - Query performance
   - ✅ `uuid-ossp` - Additional UUID functions

---

### 2.3 Connection Strings

#### Direct Connection (Backend)

```bash
# Direct connection to database
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

**Use for:**
- Backend API (via pg-pool)
- Database migrations
- Direct SQL queries

#### Pooled Connection (Alternative)

```bash
# Connection via Supabase pooler
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:6543/postgres
```

**Use for:**
- Serverless environments (Railway, Vercel)
- High-concurrency scenarios
- Auto-scaling deployments

**Differences:**

| Port | Type | Max Connections | Latency | Use Case |
|------|------|----------------|---------|----------|
| **5432** | Direct | Limited by plan | Lower | Long-lived connections |
| **6543** | Pooled | Higher | Slightly higher | Serverless, auto-scale |

---

### 2.4 Environment Variables

#### Backend `.env`

```bash
# ============================================
# DATABASE CONFIGURATION
# ============================================

# Direct connection (recommended for backend)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres

# Supabase-specific
USE_SUPABASE_PROD=true
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Connection pool settings
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
```

#### Frontend `.env`

```bash
# ============================================
# FRONTEND SUPABASE CONFIGURATION
# ============================================

VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

🚨 **SECURITY WARNING:** Never commit `.env` files to git. Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

---

## Chapter 3: Schema Design

### 3.1 Core Tables

Aisha CRM has **50+ tables** organized into functional groups:

#### CRM Core (7 tables)
```sql
-- Primary entities for CRM functionality
accounts         -- Companies/organizations
contacts         -- Individual people
leads            -- Potential customers
opportunities    -- Sales deals
activities       -- Tasks, calls, emails, meetings
notes            -- Comments and notes
notifications    -- User notifications
```

#### User Management (3 tables)
```sql
users            -- Global users (superadmins)
employees        -- Tenant-scoped users
tenant           -- Multi-tenant organizations
```

#### Business Intelligence (3 tables)
```sql
bizdev_sources   -- Business development sources
cash_flow        -- Financial transactions
daily_sales_metrics -- Sales performance tracking
```

#### System (6 tables)
```sql
audit_log        -- Security and change tracking
system_logs      -- Application logging
performance_logs -- Performance metrics
modulesettings   -- Feature toggles per tenant
api_key          -- API authentication
systembranding   -- White-label customization
```

#### Workflow & Automation (4 tables)
```sql
workflow         -- Automation definitions
workflow_execution -- Workflow run history
cron_job         -- Scheduled tasks
conversations    -- AI conversation threads
conversation_messages -- Chat messages
```

---

### 3.2 Entity Relationships

```mermaid
erDiagram
    TENANT ||--o{ EMPLOYEES : has
    TENANT ||--o{ ACCOUNTS : owns
    TENANT ||--o{ CONTACTS : owns
    TENANT ||--o{ LEADS : owns
    TENANT ||--o{ OPPORTUNITIES : owns
    
    ACCOUNTS ||--o{ CONTACTS : "has many"
    ACCOUNTS ||--o{ OPPORTUNITIES : "has many"
    CONTACTS ||--o{ OPPORTUNITIES : "primary contact"
    CONTACTS ||--o{ ACTIVITIES : related
    
    EMPLOYEES ||--o{ CONTACTS : "assigned to"
    EMPLOYEES ||--o{ LEADS : "assigned to"
    EMPLOYEES ||--o{ OPPORTUNITIES : "assigned to"
    
    OPPORTUNITIES ||--o{ ACTIVITIES : related
    LEADS ||--o{ ACTIVITIES : related
```

**Key Relationships:**

| Parent | Child | Relationship | On Delete |
|--------|-------|--------------|-----------|
| `tenant` | `employees` | One-to-Many | CASCADE |
| `tenant` | `accounts` | One-to-Many | CASCADE |
| `accounts` | `contacts` | One-to-Many | SET NULL |
| `accounts` | `opportunities` | One-to-Many | SET NULL |
| `contacts` | `opportunities` | One-to-Many | SET NULL |
| `employees` | `contacts` | One-to-Many (owner) | SET NULL |

---

### 3.3 Tenant Architecture

#### UUID-Based Tenant Identification

🚨 **CRITICAL:** Aisha CRM uses **UUID tenant IDs**, NOT slugs.

**Correct:**
```sql
SELECT * FROM contacts WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
```

**Incorrect:**
```sql
SELECT * FROM contacts WHERE tenant_id = 'acme-corp'; -- ❌ Legacy slug, not supported
```

#### Tenant Table Structure

```sql
CREATE TABLE tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE,              -- Legacy, for URLs only
  status VARCHAR(50) DEFAULT 'active',
  plan VARCHAR(50) DEFAULT 'free',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_tenant_slug ON tenant(slug);
CREATE INDEX idx_tenant_status ON tenant(status);
```

#### Tenant-Scoped Tables Pattern

**Every tenant-scoped table has:**

```sql
CREATE TABLE example_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  -- other columns...
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Always index tenant_id for query performance
CREATE INDEX idx_example_tenant ON example_table(tenant_id);
```

---

### 3.4 Metadata Pattern

Many tables use a **flexible JSONB `metadata` column** for extensibility:

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255),
  metadata JSONB DEFAULT '{}',  -- Flexible storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Metadata Use Cases

**1. Custom Fields:**
```json
{
  "custom_fields": {
    "lead_source": "Website",
    "customer_tier": "Gold",
    "preferred_contact_time": "Morning"
  }
}
```

**2. Integration Data:**
```json
{
  "integrations": {
    "salesforce_id": "003xx000004TmiQ",
    "hubspot_id": "12345",
    "stripe_customer_id": "cus_ABC123"
  }
}
```

**3. UI State:**
```json
{
  "ui_preferences": {
    "favorite": true,
    "tags": ["vip", "enterprise"],
    "color": "#FF5733"
  }
}
```

**4. Feature Flags:**
```json
{
  "crm_access": true,
  "permissions": ["read", "write", "delete"],
  "supabase_auth_id": "uuid-here"
}
```

#### Querying JSONB

```sql
-- Access nested field
SELECT first_name, metadata->>'lead_source' AS source
FROM contacts
WHERE tenant_id = 'tenant-uuid';

-- Check if field exists
SELECT * FROM contacts
WHERE metadata ? 'customer_tier';

-- Filter by nested value
SELECT * FROM contacts
WHERE metadata->'custom_fields'->>'lead_source' = 'Website';

-- Update nested field
UPDATE contacts
SET metadata = jsonb_set(
  metadata,
  '{custom_fields,lead_source}',
  '"Referral"'
)
WHERE id = 'contact-uuid';
```

---

### 3.5 Naming Conventions

#### Table Names
- **Singular form:** `account`, `contact`, `lead` (not `accounts`, `contacts`, `leads`)
- **Exception:** Some legacy tables use plural (`employees`, `bizdev_sources`, `conversations`)
- **Snake_case:** `cash_flow`, `api_key`, `system_logs`

#### Column Names
- **Snake_case:** `first_name`, `tenant_id`, `created_at`
- **Consistent timestamps:** `created_at`, `updated_at` (always TIMESTAMPTZ)
- **IDs:** Always `id` for primary key, `{table}_id` for foreign keys

#### Index Names
```sql
-- Pattern: idx_{table}_{column}
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_account ON contacts(account_id);

-- Composite indexes
CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email);
```

#### Constraint Names
```sql
-- Pattern: {table}_{column}_unique
ALTER TABLE contacts ADD CONSTRAINT contacts_email_unique UNIQUE (email, tenant_id);

-- Pattern: {table}_{column}_check
ALTER TABLE opportunities ADD CONSTRAINT opportunities_amount_check CHECK (amount >= 0);
```

---

## Chapter 4: Migrations Management

### 4.1 Migration Strategy

Aisha CRM uses **numbered sequential migrations** with the following principles:

1. **Sequential Numbering:** `001_init.sql`, `002_seed.sql`, `003_apikey.sql`
2. **Descriptive Names:** Name reflects what the migration does
3. **Idempotent:** Migrations can be safely re-run
4. **One-Way:** No automatic rollback (manual rollback migrations if needed)
5. **Applied Manually:** Via Supabase SQL Editor (not automated)

---

### 4.2 Migration Files

#### Location
```
backend/migrations/
├── 001_init.sql                    # Initial schema
├── 002_seed.sql                    # Seed data
├── 003_create_apikey.sql           # API keys table
├── 006_tenant_table.sql            # Multi-tenancy
├── 023_comprehensive_rls_security.sql # Row-level security
├── 037_add_conversation_title_topic.sql # Recent changes
└── 999_enable_rls_policies.sql     # Final RLS enforcement
```

**Current Migration Count:** 52 migrations (as of 052_tenant_identifiers.sql)

#### Migration Template

```sql
-- ============================================
-- Migration: XXX_descriptive_name.sql
-- Description: Brief explanation of changes
-- Date: YYYY-MM-DD
-- Author: Developer Name
-- ============================================

-- Enable transaction (if safe)
BEGIN;

-- Check if already applied (idempotency)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                 WHERE table_name = 'new_table') THEN
    
    -- Create table
    CREATE TABLE new_table (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- Create indexes
    CREATE INDEX idx_new_table_tenant ON new_table(tenant_id);
    
    -- Enable RLS
    ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policy
    CREATE POLICY "tenant_isolation" ON new_table
      FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    
    RAISE NOTICE 'Migration XXX applied successfully';
  ELSE
    RAISE NOTICE 'Migration XXX already applied, skipping';
  END IF;
END $$;

COMMIT;
```

---

### 4.3 Applying Migrations

#### Method 1: Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project
   - Navigate to **SQL Editor**

2. **Create New Query**
   - Click **New Query**
   - Name it: `Migration XXX - Description`

3. **Copy Migration SQL**
   - Open migration file from `backend/migrations/`
   - Copy entire contents
   - Paste into SQL Editor

4. **Execute Migration**
   - Review SQL carefully
   - Click **Run** (or press Ctrl+Enter)
   - Check for errors in output panel

5. **Verify Success**
   - Check **Table Editor** to confirm changes
   - Run validation query:
     ```sql
     SELECT tablename FROM pg_tables 
     WHERE schemaname = 'public' 
     AND tablename = 'new_table';
     ```

#### Method 2: psql Command Line

```bash
# Connect to Supabase
psql "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"

# Run migration
\i backend/migrations/001_init.sql

# Verify
\dt  # List tables
```

#### Method 3: Node.js Script

```javascript
// backend/scripts/apply-migration.js
import fs from 'fs';
import { pgPool } from '../db.js';

async function applyMigration(filename) {
  const sql = fs.readFileSync(`./migrations/${filename}`, 'utf8');
  
  try {
    await pgPool.query(sql);
    console.log(`✅ Migration ${filename} applied successfully`);
  } catch (error) {
    console.error(`❌ Migration ${filename} failed:`, error.message);
    throw error;
  }
}

// Usage: node apply-migration.js 023_comprehensive_rls_security.sql
const migrationFile = process.argv[2];
await applyMigration(migrationFile);
process.exit(0);
```

---

### 4.4 Rollback Procedures

#### Creating Rollback Migrations

For significant changes, create a corresponding rollback:

```sql
-- Original: 050_flatten_tenant_metadata.sql
ALTER TABLE tenant ADD COLUMN plan VARCHAR(50);
ALTER TABLE tenant ADD COLUMN status VARCHAR(50);
-- Migrate data from metadata to columns

-- Rollback: ROLLBACK_050_flatten_tenant_metadata.sql
ALTER TABLE tenant DROP COLUMN IF EXISTS plan;
ALTER TABLE tenant DROP COLUMN IF EXISTS status;
-- Restore data to metadata if needed
```

#### Manual Rollback Steps

1. **Identify Breaking Change**
   ```sql
   -- Check when table was created
   SELECT schemaname, tablename, 
          obj_description((schemaname||'.'||tablename)::regclass)
   FROM pg_tables
   WHERE tablename = 'problematic_table';
   ```

2. **Create Rollback Script**
   ```sql
   BEGIN;
   
   -- Reverse the changes
   DROP TABLE IF EXISTS problematic_table CASCADE;
   
   -- Restore previous state (if applicable)
   -- ...
   
   COMMIT;
   ```

3. **Test in Development First**
   - Apply rollback to dev database
   - Verify application still works
   - Check data integrity

4. **Apply to Production**
   - Schedule maintenance window
   - Backup database first
   - Apply rollback
   - Verify application health

---

### 4.5 Migration History

#### Tracking Applied Migrations

**Option 1: Manual Log (Current Approach)**

Maintain a document listing applied migrations:

```markdown
## Migration History

| # | File | Date Applied | Applied By | Notes |
|---|------|--------------|------------|-------|
| 001 | 001_init.sql | 2025-01-15 | Admin | Initial schema |
| 002 | 002_seed.sql | 2025-01-15 | Admin | Seed data |
| 023 | 023_comprehensive_rls_security.sql | 2025-11-05 | Admin | RLS security |
| 037 | 037_add_conversation_title_topic.sql | 2025-11-10 | Admin | AI features |
```

**Option 2: Migration Table (Recommended for Future)**

```sql
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by VARCHAR(255),
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Track migration
INSERT INTO schema_migrations (migration_name, applied_by, execution_time_ms)
VALUES ('023_comprehensive_rls_security.sql', 'admin@example.com', 1250);

-- Check if migration applied
SELECT * FROM schema_migrations WHERE migration_name = '023_comprehensive_rls_security.sql';
```

#### Key Migrations Reference

| Migration | Description | Impact |
|-----------|-------------|--------|
| **001_init.sql** | Initial schema | Creates core tables |
| **006_tenant_table.sql** | Multi-tenancy | Adds tenant isolation |
| **023_comprehensive_rls_security.sql** | RLS policies | Enables row-level security (CRITICAL) |
| **024_fix_function_search_path.sql** | Function security | Fixes mutable search_path |
| **032_normalize_foreign_keys.sql** | FK optimization | Improves referential integrity |
| **037_add_conversation_title_topic.sql** | AI conversations | Adds title/topic fields |
| **052_tenant_identifiers.sql** | UUID tenant IDs | Enforces UUID-based tenants |

---

## Chapter 5: Indexing Strategy

### 5.1 Index Types

PostgreSQL supports multiple index types:

| Type | Use Case | Example |
|------|----------|---------|
| **B-Tree** (default) | Equality, range queries | `CREATE INDEX idx_name ON table(column);` |
| **Hash** | Equality only (faster) | `CREATE INDEX idx_name ON table USING HASH(column);` |
| **GIN** | JSONB, arrays, full-text | `CREATE INDEX idx_name ON table USING GIN(jsonb_column);` |
| **GiST** | Geometric data, full-text | `CREATE INDEX idx_name ON table USING GIST(column);` |
| **BRIN** | Very large tables, time-series | `CREATE INDEX idx_name ON table USING BRIN(created_at);` |

---

### 5.2 Primary Indexes

Every table has a primary key index automatically:

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- Automatic index: contacts_pkey
  -- ...
);

-- Equivalent to:
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid()
);
ALTER TABLE contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
-- This creates: INDEX contacts_pkey ON contacts(id)
```

---

### 5.3 Foreign Key Indexes

🚨 **CRITICAL:** Always index foreign key columns for performance.

**Bad (No Index):**
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id)
  -- ❌ No index on account_id = slow JOINs
);
```

**Good (With Index):**
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id)
);

CREATE INDEX idx_contacts_account ON contacts(account_id);
-- ✅ Fast JOINs and foreign key checks
```

**Applied to All Tables:**

See migration `025_add_foreign_key_indexes.sql`:

```sql
-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id);

-- Opportunities
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);

-- Activities
CREATE INDEX IF NOT EXISTS idx_activities_related_id ON activities(related_id);

-- And 20+ more...
```

---

### 5.4 Performance Indexes

#### Tenant Isolation Indexes

**Every tenant-scoped table has:**

```sql
CREATE INDEX idx_{table}_tenant ON {table}(tenant_id);
```

**Why:** Most queries filter by `tenant_id` first:
```sql
SELECT * FROM contacts WHERE tenant_id = 'uuid' AND email = 'test@example.com';
-- Uses: idx_contacts_tenant
```

#### Composite Indexes

For common query patterns:

```sql
-- Pattern: WHERE tenant_id = X AND email = Y
CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email);

-- Pattern: WHERE tenant_id = X ORDER BY created_at DESC
CREATE INDEX idx_contacts_tenant_created ON contacts(tenant_id, created_at DESC);

-- Pattern: WHERE tenant_id = X AND status = Y
CREATE INDEX idx_opportunities_tenant_status ON opportunities(tenant_id, status);
```

**Column Order Matters:**
```sql
-- Good: Most selective column first
CREATE INDEX idx_users_email_tenant ON users(email, tenant_id);  -- email is unique

-- Less optimal: Less selective column first
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);  -- many rows per tenant
```

#### JSONB Indexes

For metadata queries:

```sql
-- GIN index for JSONB contains queries
CREATE INDEX idx_contacts_metadata ON contacts USING GIN (metadata);

-- Query benefits:
SELECT * FROM contacts WHERE metadata @> '{"lead_source": "Website"}';
SELECT * FROM contacts WHERE metadata ? 'customer_tier';
```

---

### 5.5 Index Maintenance

#### Monitoring Index Usage

```sql
-- Find unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

#### Index Bloat

```sql
-- Check index bloat
SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;
```

#### Reindexing

```sql
-- Reindex single index (quick)
REINDEX INDEX idx_contacts_tenant;

-- Reindex entire table (slower)
REINDEX TABLE contacts;

-- Reindex database (maintenance window required)
REINDEX DATABASE postgres;
```

---

## Chapter 6: Data Integrity

### 6.1 Constraints

Constraints enforce data integrity at the database level:

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,                          -- PRIMARY KEY constraint
  tenant_id UUID NOT NULL,                      -- NOT NULL constraint
  email VARCHAR(255) UNIQUE,                    -- UNIQUE constraint
  phone VARCHAR(50) CHECK (phone ~ '^\+?[0-9]{10,15}$'),  -- CHECK constraint
  account_id UUID REFERENCES accounts(id),      -- FOREIGN KEY constraint
  metadata JSONB DEFAULT '{}',                  -- DEFAULT constraint
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 6.2 Foreign Keys

#### Standard Foreign Keys

```sql
CREATE TABLE opportunities (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL
);
```

**ON DELETE Actions:**

| Action | Behavior | Use Case |
|--------|----------|----------|
| **CASCADE** | Delete child records | tenant → employees |
| **SET NULL** | Set FK to NULL | account → contacts (optional) |
| **RESTRICT** | Prevent deletion if children exist | Default if not specified |
| **NO ACTION** | Same as RESTRICT | Compliance/audit scenarios |

#### Circular References

**Problem:** Account references primary_contact, Contact references account

**Solution:** Create FK after both tables exist:

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  primary_contact_id UUID  -- No FK yet
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id)  -- FK to accounts
);

-- Add FK after both tables exist
ALTER TABLE accounts 
  ADD CONSTRAINT fk_accounts_primary_contact 
  FOREIGN KEY (primary_contact_id) 
  REFERENCES contacts(id) 
  ON DELETE SET NULL;
```

---

### 6.3 Unique Constraints

#### Single Column Unique

```sql
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
```

#### Composite Unique

```sql
-- Email must be unique per tenant
ALTER TABLE employees 
  ADD CONSTRAINT employees_email_tenant_unique 
  UNIQUE (email, tenant_id);
```

#### Partial Unique

```sql
-- Only active users must have unique email
CREATE UNIQUE INDEX users_email_unique_active 
  ON users(email) 
  WHERE status = 'active';
```

---

### 6.4 Check Constraints

```sql
-- Amount must be positive
ALTER TABLE opportunities 
  ADD CONSTRAINT opportunities_amount_check 
  CHECK (amount >= 0);

-- Probability must be 0-100
ALTER TABLE opportunities 
  ADD CONSTRAINT opportunities_probability_check 
  CHECK (probability >= 0 AND probability <= 100);

-- Status must be valid value
ALTER TABLE leads 
  ADD CONSTRAINT leads_status_check 
  CHECK (status IN ('new', 'contacted', 'qualified', 'lost', 'converted'));

-- Email format validation
ALTER TABLE contacts 
  ADD CONSTRAINT contacts_email_check 
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');
```

---

### 6.5 Triggers

#### Auto-Update Timestamps

```sql
-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

#### Email Uniqueness Across Tables

See migration `020_enforce_email_uniqueness.sql`:

```sql
CREATE OR REPLACE FUNCTION check_email_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
  -- Check in users table
  IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER(NEW.email)) THEN
    RAISE EXCEPTION 'Email already exists in users table';
  END IF;
  
  -- Check in employees table
  IF EXISTS (SELECT 1 FROM employees WHERE LOWER(email) = LOWER(NEW.email)) THEN
    RAISE EXCEPTION 'Email already exists in employees table';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to both tables
CREATE TRIGGER users_email_uniqueness_check
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_email_uniqueness();

CREATE TRIGGER employees_email_uniqueness_check
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION check_email_uniqueness();
```

#### Audit Logging Trigger

```sql
CREATE OR REPLACE FUNCTION log_user_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    changed_by,
    changed_at
  ) VALUES (
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    row_to_json(OLD),
    row_to_json(NEW),
    current_user,
    NOW()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply to sensitive tables
CREATE TRIGGER audit_users_changes
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_user_changes();
```

---

**[Continue to Part 2 for Chapters 7-12 and Appendices](./AISHA_CRM_DATABASE_MANUAL_PART2.md)**

---

*Aisha CRM Database Administration Manual - Part 1*  
*Copyright © 2025 4V Data Consulting. All rights reserved.*  
*Version 1.0 - November 15, 2025*
