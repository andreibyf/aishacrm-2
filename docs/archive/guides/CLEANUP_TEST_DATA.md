# Clean Up Mock/Test Data

## Overview
After fixing the mock user injection bug, your production database may contain test data created while the app was in "dev mode". This script helps identify and remove those records safely.

## What Gets Removed
The script identifies records with:
- **Mock user IDs**: `local-dev-user-001`
- **Mock tenant IDs**: `6cb4c008-4847-426a-9a2e-918ad70e7b69`
- **Test email patterns**:
  - `dev@localhost`
  - `*test@*`
  - `*@test.com`
  - `*+test@*`
  - `mock@*`
  - `fake@*`
  - `demo@localhost*`

## Tables Cleaned (in safe order)
Activities, audit logs, opportunities, leads, contacts, accounts, employees, users, tenants, and more.

## Usage

### 1. Dry Run (Safe - Shows What Would Be Deleted)
```bash
cd /path/to/repo
node backend/scripts/cleanup-mock-test-data.js
```

This will scan all tables and report what it finds **without deleting anything**.

### 2. Review the Output
Look at the records it found:
- Are they actually test data?
- Any false positives (real users with "test" in email)?
- Note the table names and record counts

### 3. Execute Cleanup (Destructive - Actually Deletes)
**⚠️ WARNING: This permanently deletes records!**

```bash
node backend/scripts/cleanup-mock-test-data.js --execute
```

## Example Output
```
🔍 Scanning Supabase database for mock/test data...

ℹ️  DRY RUN MODE - No records will be deleted (use --execute to delete)

Scanning activities... 
  Found 23 test record(s):
    - dev@localhost
    - test-activity-001
    - 6cb4c008-4847-426a-9a2e-918ad70e7b69
    ... and 20 more

Scanning contacts... ✓ Clean

Scanning users... 
  Found 1 test record(s):
    - dev@localhost

============================================================
SUMMARY
============================================================
Tables with test data: 2
Total test records found: 24

ℹ️  Run with --execute flag to delete these records.
```

## Post-Cleanup Steps
After running with `--execute`:

1. **Verify in Supabase Dashboard**
   - Check Tables → Users, Contacts, Accounts
   - Confirm test data is gone

2. **Clear Frontend Cache**
   - Browser: DevTools → Application → Clear Storage
   - Hard refresh (Ctrl+Shift+R)

3. **Test Login/Logout**
   - Should see your real superadmin account
   - Logout should work properly now

## Rollback
If you accidentally delete production data:
1. Restore from Supabase's automatic backups (if enabled)
2. Or restore from your manual backup taken before cleanup

## Safety Notes
- Always run **dry run first** to review what will be deleted
- Take a manual database backup before executing
- The script respects foreign key constraints (deletes children first)
- Mock tenant is deleted last to prevent orphan records

## Troubleshooting

### "Missing SUPABASE_URL" Error
Ensure `backend/.env` has:
```env
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

### Foreign Key Errors
If deletion fails due to constraints, manually delete dependent records first or disable RLS temporarily in Supabase dashboard.

### False Positives
If you have legitimate users with "test" emails, modify the `TEST_EMAIL_PATTERNS` array in the script to be more specific.
