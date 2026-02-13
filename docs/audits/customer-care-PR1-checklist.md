# C.A.R.E. v1 – PR1 Implementation Checklist (DB Tables Only)

**PR1 goal:** Add **C.A.R.E. state storage** as **additive migrations only**.

This PR MUST NOT:
- change runtime behavior
- change existing tables or constraints
- add triggers
- wire any hooks/workers/executors

This PR MUST:
- create new tables + indexes
- be safe for an existing client already using the app

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr1-db-tables`

---

## 2) Files to Add / Modify

### 2.1 Add a migration file

Add a new migration in your backend migration system. Use the repo’s existing convention.

Common patterns (pick what matches your repo):
- `backend/migrations/###_customer_care_state.sql`
- `backend/migrations/YYYYMMDDHHMM_customer_care_state.sql`
- If you use a JS/TS migration runner, follow that naming.

This checklist assumes **SQL migration**.

---

## 3) Schema (Minimum v1)

### 3.1 Table: `customer_care_state`

**Purpose:** One row per (tenant, entity).

**Columns**
- `id uuid primary key default gen_random_uuid()`
- `tenant_id text not null`
- `entity_type text not null`  
  - allowed values: `lead`, `contact`, `account`
- `entity_id uuid not null`
- `care_state text not null`
  - allowed values (canonical):
    - `unaware`
    - `aware`
    - `engaged`
    - `evaluating`
    - `committed`
    - `active`
    - `at_risk`
    - `dormant`
    - `reactivated`
    - `lost`
- `hands_off_enabled boolean not null default false`
  - **Important:** default is **false** to avoid surprising your existing client.
  - v1 can later move to default true for new tenants only, but not in PR1.
- `escalation_status text null`
  - allowed values: `open`, `closed` (or null)
- `last_signal_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

**Constraints**
- Unique constraint:
  - `unique (tenant_id, entity_type, entity_id)`
- Check constraints (recommended):
  - `entity_type in ('lead','contact','account')`
  - `care_state in (...)`
  - `escalation_status is null or escalation_status in ('open','closed')`

**Indexes**
- `idx_customer_care_state_tenant_state (tenant_id, care_state)`
- `idx_customer_care_state_tenant_entity (tenant_id, entity_type, entity_id)` (optional if unique index covers)

---

### 3.2 Table: `customer_care_state_history`

**Purpose:** Audit trail of transitions and key decisions.

**Columns**
- `id uuid primary key default gen_random_uuid()`
- `tenant_id text not null`
- `entity_type text not null`
- `entity_id uuid not null`
- `from_state text null`
- `to_state text null`
- `event_type text not null`
  - examples: `state_proposed`, `state_applied`, `escalation_opened`, `escalation_closed`, `action_candidate`
- `reason text not null`
- `meta jsonb null`
- `actor_type text not null default 'system'`
  - allowed: `system`, `user`, `agent`
- `actor_id text null`
- `created_at timestamptz not null default now()`

**Constraints**
- Check constraints (recommended):
  - `entity_type in ('lead','contact','account')`
  - `actor_type in ('system','user','agent')`

**Indexes**
- `idx_customer_care_hist_tenant_entity_time (tenant_id, entity_type, entity_id, created_at desc)`
- `idx_customer_care_hist_tenant_time (tenant_id, created_at desc)`

---

## 4) Postgres Extensions

This schema uses `gen_random_uuid()`.

If your DB already has `pgcrypto`, do nothing.

If not, add to migration (only if safe in your environment):
- `create extension if not exists pgcrypto;`

---

## 5) Migration Safety Requirements

- Additive only
- No table locks beyond creation
- No backfills
- No RLS changes in PR1

---

## 6) Validation Steps

### 6.1 Apply migration locally/dev

- Confirm tables exist:
  - `customer_care_state`
  - `customer_care_state_history`

### 6.2 Insert smoke test (manual)

Insert one row (adjust tenant/entity IDs to match your dev data):
- Ensure `hands_off_enabled` defaults to false
- Ensure invalid care_state fails the check constraint

### 6.3 Confirm no app behavior changes

- Existing client flows function unchanged
- No new tasks, notifications, or messages

---

## 7) PR Title & Description

**Title:** `C.A.R.E. PR1: Add customer_care_state tables (additive)`

**Description:**
- Adds normalized state and history tables
- Default hands_off_enabled is false (safety)
- No runtime behavior changes

---

End.
