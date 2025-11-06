# Superadmin Account Security & Email Uniqueness

## Overview
This document describes the security measures implemented to protect the primary superadmin account and enforce global email uniqueness across the system.

## 🔒 Immutable Superadmin Protection

### What It Does
- **Prevents ANY modifications** to designated superadmin accounts via API
- **Blocks deletion** of protected accounts
- Protected accounts can **only be modified directly in Supabase Auth Dashboard**

### Protected Accounts
Currently protected email addresses (defined in `backend/routes/users.js`):
- `abyfield@4vdataconsulting.com` (Primary system owner)

### Implementation Details

#### Routes Protected:
1. **PUT /api/users/:id** - Update user
   - Returns 403 `IMMUTABLE_ACCOUNT` error code
   - Message: "This superadmin account is immutable and cannot be modified via API"
   
2. **DELETE /api/users/:id** - Delete user
   - Returns 403 `IMMUTABLE_ACCOUNT` error code
   - Message: "This superadmin account is immutable and cannot be deleted"

#### Adding More Protected Accounts
Edit `backend/routes/users.js` and update the `IMMUTABLE_SUPERADMINS` array in both PUT and DELETE routes:

```javascript
const IMMUTABLE_SUPERADMINS = [
  'abyfield@4vdataconsulting.com', // Primary system owner
  'another.admin@example.com',      // Add more as needed
];
```

## 📧 Global Email Uniqueness

### What It Does
- **Enforces unique emails** across BOTH `users` and `employees` tables
- **Prevents duplicate accounts** with the same email address
- **Case-insensitive** comparison (TEST@example.com = test@example.com)

### Three-Layer Enforcement

#### 1. Application Layer (Backend API)
**File:** `backend/routes/users.js` - POST /api/users

```javascript
// Checks both tables before creating new user
const existingInUsers = await pgPool.query(
  "SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)", [email]
);
const existingInEmployees = await pgPool.query(
  "SELECT id, email, tenant_id FROM employees WHERE LOWER(email) = LOWER($1)", [email]
);

// Returns 409 DUPLICATE_EMAIL if found
```

**Error Response:**
```json
{
  "status": "error",
  "message": "An account with this email already exists",
  "code": "DUPLICATE_EMAIL",
  "hint": "Email addresses must be unique across all users and employees",
  "existing": {
    "id": "uuid",
    "email": "email@example.com",
    "table": "users" // or "employees"
  }
}
```

#### 2. Database Layer (Indexes)
**File:** `backend/migrations/020_enforce_email_uniqueness.sql`

```sql
-- Unique indexes on each table (case-insensitive)
CREATE UNIQUE INDEX users_email_unique_idx ON users (LOWER(email));
CREATE UNIQUE INDEX employees_email_unique_idx ON employees (LOWER(email));
```

#### 3. Database Layer (Cross-Table Triggers)
**File:** `backend/migrations/020_enforce_email_uniqueness.sql`

```sql
-- Trigger function prevents duplicates across tables
CREATE FUNCTION check_email_uniqueness() RETURNS TRIGGER;
CREATE TRIGGER users_email_uniqueness_check BEFORE INSERT OR UPDATE;
CREATE TRIGGER employees_email_uniqueness_check BEFORE INSERT OR UPDATE;
```

**Database Error:**
```
ERROR: Email already exists in users table
HINT: Email addresses must be unique across all users and employees
```

## 🔍 Testing & Verification

### Test Duplicate Email Prevention

#### Via API (Blocked by Production Safety Guard in prod):
```powershell
$body = @{ 
  email = 'existing@email.com'; 
  first_name = 'Test'; 
  role = 'employee'; 
  tenant_id = 'test-tenant' 
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3001/api/users' `
  -Method Post `
  -Body $body `
  -ContentType 'application/json'
```

Expected: 409 error with `DUPLICATE_EMAIL` code

#### Via Database (Always enforced):
```sql
-- This should fail with unique violation
INSERT INTO employees (email, first_name, tenant_id, role)
VALUES ('existing@email.com', 'Test', 'tenant-1', 'employee');
```

### Test Immutable Account Protection

#### Try to Update:
```powershell
$id = '116d1735-0089-43c2-9647-bfff145a423a' # Your superadmin ID
$body = @{ first_name = 'Changed' } | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/users/$id" `
  -Method Put `
  -Body $body `
  -ContentType 'application/json'
```

Expected: 403 error with `IMMUTABLE_ACCOUNT` code

#### Try to Delete:
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/users/$id" `
  -Method Delete
```

Expected: 403 error with `IMMUTABLE_ACCOUNT` code

## 🛠️ Modifying Protected Accounts

### The ONLY Way to Modify Protected Superadmins:

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/[your-project-id]/auth/users

2. **Find the User**
   - Search by email: `abyfield@4vdataconsulting.com`

3. **Edit Auth Metadata**
   - Click on the user
   - Edit `user_metadata` or `app_metadata`
   - Update fields like:
     - `first_name`
     - `last_name`
     - `display_name`
     - `role` (be careful!)

4. **Database Sync** (if needed)
   - If you change the email in Supabase Auth, manually update the database:
   ```sql
   UPDATE users 
   SET email = 'new@email.com', updated_at = NOW()
   WHERE id = '116d1735-0089-43c2-9647-bfff145a423a';
   ```

### Change Password:
Use the Supabase Auth dashboard or send a password reset email via the dashboard.

## 📊 Migration History

### 019_cleanup_duplicate_emails.sql
- **Purpose:** Remove existing duplicate emails before enforcing uniqueness
- **What it does:**
  - Identifies all duplicate emails across users and employees tables
  - Keeps the OLDEST record per email (most likely the original/real account)
  - Removes newer duplicates
  - Displays remaining cross-table duplicates for manual review

### 020_enforce_email_uniqueness.sql
- **Purpose:** Enforce global email uniqueness at the database level
- **What it does:**
  - Creates unique indexes on both tables (case-insensitive)
  - Adds trigger function to prevent cross-table duplicates
  - Adds check constraints to prevent empty emails
  - Documents the enforcement with database comments

## 🚨 Emergency Procedures

### If You Get Locked Out
1. **Use Supabase Dashboard** to reset your password
2. **Check email** for the reset link
3. **Verify database record exists:**
   ```sql
   SELECT * FROM users WHERE email = 'abyfield@4vdataconsulting.com';
   ```

### If Someone Accidentally Deletes Your Account
1. **Don't panic** - the API will block deletion attempts
2. If they bypassed the API and deleted directly in database:
   ```sql
   -- Re-create from backup or manually:
   INSERT INTO users (id, email, first_name, last_name, role, metadata)
   VALUES (
     '116d1735-0089-43c2-9647-bfff145a423a',
     'abyfield@4vdataconsulting.com',
     'Andrei',
     'Byfield',
     'superadmin',
     '{"permissions": ["full_system_access"], "is_superadmin": true}'::jsonb
   );
   ```

### If You Need to Remove Protection
1. Edit `backend/routes/users.js`
2. Remove your email from `IMMUTABLE_SUPERADMINS` array
3. Restart backend server
4. Make your changes
5. **Re-add protection immediately after**

## 📝 Related Files
- `backend/routes/users.js` - API route protection logic
- `backend/migrations/019_cleanup_duplicate_emails.sql` - Cleanup migration
- `backend/migrations/020_enforce_email_uniqueness.sql` - Uniqueness enforcement
- `backend/middleware/productionSafetyGuard.js` - Production write protection

## 🔗 See Also
- [Production Safety Guard Documentation](../docs/PRODUCTION_SAFETY_GUARD.md)
- [Database Security Best Practices](../docs/DATABASE_SECURITY.md)
- [User Management Guide](../docs/USER_MANAGEMENT.md)

---

**Last Updated:** November 5, 2025  
**Maintained By:** System Administrator
