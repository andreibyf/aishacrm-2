# Cron System Documentation

## Overview

The AishaCRM cron system is a database-backed scheduled job manager that runs maintenance tasks automatically. It has been fully refactored from a stub implementation to a complete, production-ready system.

## Architecture

### Components

1. **Database Table** (`cron_job`)
   - Stores job definitions with schedule, function name, and metadata
   - Tracks execution history (last_run, next_run)
   - Supports both global and tenant-specific jobs

2. **Backend API** (`backend/routes/cron.js`)
   - Full CRUD operations for job management
   - Job execution endpoint with error handling
   - Schedule calculation engine

3. **Job Executor Registry** (`backend/lib/cronExecutors.js`)
   - Registry pattern for job functions
   - Built-in jobs: markUsersOffline, cleanOldActivities, syncDenormalizedFields
   - Easy to extend with new job types

4. **Frontend Heartbeat** (`src/components/shared/CronHeartbeat.jsx`)
   - Triggers job execution every 5 minutes
   - Admin/SuperAdmin only
   - Automatic failover handling

## Database Schema

```sql
CREATE TABLE cron_job (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL for global jobs
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,                  -- e.g., 'every_5_minutes', 'daily', 'cron:0 2 * * *'
  function_name TEXT,                      -- Maps to job in cronExecutors registry
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### GET `/api/cron/jobs`
List all cron jobs with optional filtering.

**Query Parameters:**
- `tenant_id` - Filter by tenant (optional)
- `is_active` - Filter by active status (optional)

**Response:**
```json
{
  "status": "success",
  "data": {
    "jobs": [
      {
        "id": "uuid",
        "name": "Mark Users Offline",
        "schedule": "every_5_minutes",
        "function_name": "markUsersOffline",
        "is_active": true,
        "last_run": "2025-01-15T10:30:00Z",
        "next_run": "2025-01-15T10:35:00Z",
        "metadata": { "timeout_minutes": 5 }
      }
    ]
  }
}
```

### POST `/api/cron/jobs`
Create a new cron job.

**Body:**
```json
{
  "name": "My Custom Job",
  "schedule": "hourly",
  "function_name": "myCustomFunction",
  "is_active": true,
  "tenant_id": "uuid-or-null",
  "metadata": { "custom": "config" }
}
```

### PUT `/api/cron/jobs/:id`
Update an existing cron job. Automatically recalculates `next_run` if schedule changes.

### DELETE `/api/cron/jobs/:id`
Delete a cron job.

### POST `/api/cron/run`
Execute all due cron jobs (where `next_run <= NOW()`).

**Response:**
```json
{
  "status": "success",
  "data": {
    "summary": {
      "total": 3,
      "executed": 2,
      "skipped": 0,
      "failed": 1
    },
    "executed": [
      {
        "id": "uuid",
        "name": "Mark Users Offline",
        "function_name": "markUsersOffline",
        "next_run": "2025-01-15T10:40:00Z",
        "executed_at": "2025-01-15T10:35:00Z"
      }
    ],
    "failed": [
      {
        "id": "uuid",
        "name": "Failed Job",
        "error": "Error message"
      }
    ]
  }
}
```

## Schedule Expressions

The system supports the following schedule formats:

| Expression | Description | Next Run Calculation |
|------------|-------------|---------------------|
| `every_5_minutes` | Every 5 minutes | +5 minutes |
| `every_15_minutes` | Every 15 minutes | +15 minutes |
| `every_30_minutes` | Every 30 minutes | +30 minutes |
| `hourly` | Every hour | +1 hour |
| `daily` | Every day at midnight UTC | +1 day |
| `weekly` | Every Monday at midnight UTC | +7 days |
| `cron:* * * * *` | Standard cron expression | Parsed via cron library |

### Custom Cron Expressions

For complex schedules, use the `cron:` prefix:

- `cron:0 2 * * *` - Daily at 2 AM UTC
- `cron:0 */6 * * *` - Every 6 hours
- `cron:0 0 * * 0` - Weekly on Sunday at midnight

## Built-in Jobs

### 1. Mark Users Offline (`markUsersOffline`)

**Purpose:** Automatically sets users to offline status if they haven't sent a heartbeat within the timeout period.

**Schedule:** `every_5_minutes` (active by default)

**Configuration:**
```json
{
  "timeout_minutes": 5
}
```

**How it works:**
- Queries `users` and `employees` tables
- Finds records where `last_seen` < (NOW - timeout_minutes)
- Updates `metadata.live_status = 'offline'`
- Returns count of users marked offline

**Example Output:**
```json
{
  "users_marked_offline": 12,
  "employees_marked_offline": 45,
  "total": 57
}
```

### 2. Clean Old Activities (`cleanOldActivities`)

**Purpose:** Archive or delete old activity records to maintain database performance.

**Schedule:** `daily` (inactive by default)

**Configuration:**
```json
{
  "retention_days": 90
}
```

**Status:** Placeholder - needs implementation

### 3. Sync Denormalized Fields (`syncDenormalizedFields`)

**Purpose:** Update cached/denormalized data for performance optimization.

**Schedule:** `hourly` (inactive by default)

**Status:** Placeholder - needs implementation

## Adding New Jobs

### 1. Create Job Function

Add to `backend/lib/cronExecutors.js`:

```javascript
export async function myNewJob(supabase, jobMetadata = {}) {
  const config = jobMetadata.my_config || 'default';
  
  try {
    // Your job logic here using Supabase client
    const { data, error } = await supabase.from('table_name').select('*');
    if (error) throw error;
    
    return {
      success: true,
      processed: data?.length || 0,
      config
    };
  } catch (error) {
    console.error('myNewJob error:', error);
    throw error;
  }
}
```

### 2. Register in Job Registry

```javascript
export const jobExecutors = {
  markUsersOffline,
  cleanOldActivities,
  syncDenormalizedFields,
  myNewJob  // Add here
};
```

### 3. Create Job via API or Seed Script

```javascript
await pool.query(
  `INSERT INTO cron_job (name, schedule, function_name, is_active, next_run, metadata)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [
    'My New Job',
    'hourly',
    'myNewJob',
    true,
    new Date(),
    { my_config: 'value' }
  ]
);
```

## Testing

### 1. Seed Default Jobs

```bash
cd backend
node scripts/seed-cron-jobs.js
```

### 2. Run Integration Test

```bash
node test-cron-system.js
```

This test:
- Creates test users with stale presence
- Executes `markUsersOffline` job
- Verifies users are marked offline
- Cleans up test data

### 3. Manual Execution via API

```bash
# Trigger all due jobs
curl -X POST http://localhost:3001/api/cron/run

# Check job status
curl http://localhost:3001/api/cron/jobs
```

## Frontend Integration

The `CronHeartbeat` component automatically triggers job execution:

```jsx
<CronHeartbeat />
```

**Behavior:**
- Runs every 5 minutes (300,000ms)
- Initial delay of 10 seconds
- Admin/SuperAdmin only
- Automatic retry with circuit breaker (max 3 failures)

## Monitoring

### Job Execution Status

Check `metadata` field for execution history:

```sql
SELECT 
  name,
  is_active,
  last_run,
  next_run,
  metadata->>'last_execution' as last_execution,
  metadata->>'execution_count' as execution_count,
  metadata->>'last_error' as last_error,
  metadata->>'error_count' as error_count
FROM cron_job
ORDER BY next_run;
```

### View Due Jobs

```sql
SELECT * FROM cron_job
WHERE is_active = true
AND next_run <= NOW()
ORDER BY next_run;
```

### Check Offline Users

```sql
-- Users
SELECT email, metadata->>'live_status' as status, metadata->>'last_seen' as last_seen
FROM users
WHERE metadata->>'live_status' = 'offline'
ORDER BY (metadata->>'last_seen')::timestamptz DESC;

-- Employees
SELECT email, metadata->>'live_status' as status, metadata->>'last_seen' as last_seen
FROM employees
WHERE metadata->>'live_status' = 'offline'
ORDER BY (metadata->>'last_seen')::timestamptz DESC;
```

## Troubleshooting

### Jobs Not Running

1. Check if jobs are active:
   ```sql
   SELECT name, is_active, next_run FROM cron_job;
   ```

2. Verify CronHeartbeat is mounted in Layout.jsx

3. Check browser console for errors

4. Verify user is admin/superadmin

### Jobs Failing

1. Check metadata for error details:
   ```sql
   SELECT name, metadata->>'last_error' as error, metadata->>'error_count' as count
   FROM cron_job
   WHERE metadata->>'last_error' IS NOT NULL;
   ```

2. Review backend logs (console.error output)

3. Test job function directly:
   ```javascript
   import { executeJob } from './lib/cronExecutors.js';
   const result = await executeJob('functionName', pool, {});
   console.log(result);
   ```

### Next Run Not Updating

- Ensure schedule expression is valid
- Check if calculateNextRun is handling the format
- Manually trigger recalculation:
  ```sql
  UPDATE cron_job
  SET next_run = NOW() + INTERVAL '5 minutes'
  WHERE schedule = 'every_5_minutes';
  ```

## Migration from Base44

The cron system is now **independent from Base44**:

- ✅ Local database storage (`cron_job` table)
- ✅ Local backend execution (`/api/cron/run`)
- ✅ No external dependencies

**Old approach (deprecated):**
```javascript
import { cronJobRunner } from '@/api/functions'; // Base44 SDK
await cronJobRunner({});
```

**New approach:**
```javascript
await fetch(`${BACKEND_URL}/api/cron/run`, { method: 'POST' });
```

## Performance Considerations

- Jobs run sequentially (for-loop, not parallel)
- Each job updates database twice (before execution + after)
- Long-running jobs block subsequent jobs
- Consider splitting heavy jobs into smaller chunks
- Use `is_active=false` to disable non-critical jobs during high load

## Security

- All endpoints should validate user roles (admin/superadmin only)
- Job execution is server-side (no client-side function execution)
- Metadata is stored as JSONB (supports complex config)
- No SQL injection risk (parameterized queries)

## Future Enhancements

- [ ] Job dependencies (run Job B only if Job A succeeds)
- [ ] Parallel execution for independent jobs
- [ ] Job priority/queue system
- [ ] Webhook notifications on job failure
- [ ] Job execution history table (separate from metadata)
- [ ] Web UI for job management (currently API-only)
- [ ] Distributed locking for multi-instance deployments

---

**Last Updated:** January 2025  
**Maintainer:** AishaCRM Team
