# System Logs Guide

## Overview

The System Logs feature provides comprehensive logging and monitoring for your Aisha CRM application. Logs are **automatically created** when significant events occur, giving you visibility into system health, errors, and important activities.

---

## Log Levels

The system uses four log levels to categorize events by severity:

| Level | Badge Color | Description | When Used |
|-------|-------------|-------------|-----------|
| **INFO** | Blue | Normal operations | Successful actions, routine events, informational messages |
| **WARNING** | Yellow | Potential issues | Non-critical problems, deprecations, graceful shutdowns |
| **ERROR** | Red | Failures & exceptions | API errors, crashes, failed operations, critical issues |
| **DEBUG** | Gray | Diagnostic info | Development troubleshooting, detailed system state |

---

## Automatic Logging Sources

Logs are **created automatically** - you don't need to manually create them. Here's when each type of log is generated:

### 1. Backend Lifecycle Events

**Source:** `Backend Server`  
**Tenant:** `system` (visible across all tenants)

| Event | Level | When Created |
|-------|-------|--------------|
| Server Startup | INFO | Backend starts successfully |
| Graceful Shutdown | WARNING | SIGTERM signal received (normal shutdown) |
| Server Crash | ERROR | Uncaught exception occurs |
| Startup Failure | ERROR | Server fails to start (port in use, etc.) |
| Promise Rejection | ERROR | Unhandled promise rejection detected |

**Example Metadata Included:**
- Port number
- Environment (development/production)
- Database type
- Uptime (for shutdowns)
- Stack traces (for errors)

### 2. Frontend Application Errors

**Source:** Component name (e.g., `ContactForm`, `UserManagement`)  
**Tenant:** Current user's tenant

| Event | Level | When Created |
|-------|-------|--------------|
| API Error (4xx/5xx) | ERROR or WARNING | Failed API requests |
| Component Error | ERROR | React component crashes |
| Network Failure | ERROR | Connection issues |
| Validation Error | WARNING | User input validation failures |

**Triggered by:** `ErrorLogger.jsx` component when `handleApiError()` is called

**Example Metadata Included:**
- HTTP status code
- Error severity (critical/error/warning)
- Actionable flag
- Additional error details
- Timestamp

### 3. Console Auto-Capture

**Source:** Various components  
**Tenant:** Current user's tenant

The system automatically intercepts and logs:
- `console.error()` calls → ERROR logs
- `console.warn()` calls → WARNING logs

**Note:** Only active in development mode to avoid performance impact in production.

---

## Using the System Logs UI

### Accessing System Logs

Navigate to: **Settings → System Logs**

### Filtering Logs

#### 1. Level Filter
Filter by severity:
- **All** - Show all log levels
- **INFO** - Show only informational logs
- **WARNING** - Show only warnings
- **ERROR** - Show only errors
- **DEBUG** - Show only debug logs

#### 2. Source Filter
Filter by origin:
- **All** - Show logs from all sources
- **Backend Server** - Backend lifecycle events only
- **test** - Test/development logs
- **[Component Name]** - Logs from specific UI components

#### 3. Search
Free-text search across log messages. Case-insensitive.

### Understanding Log Entries

Each log entry displays:

```
[Level Badge] [Source Badge] [Timestamp]
Message text
[Expandable Metadata Section]
```

**Example:**
```
ERROR   Backend Server   10/29/2025, 7:12:42 PM
Uncaught exception: Cannot read property 'id' of undefined
📋 Metadata: {"stack": "Error at...", "uptime": 3600}
```

### Timestamps

- All timestamps use your local browser timezone
- Format: `MM/DD/YYYY, HH:MM:SS AM/PM`
- Database stores in UTC, displayed in local time

### Metadata

Click the **"📋 Metadata"** button to expand and view:
- Structured JSON data
- Error stack traces
- Request details
- System configuration at time of log

---

## Multi-Tenant Logging

### Tenant Isolation

- Most logs are **tenant-specific** (visible only to that tenant)
- Backend lifecycle logs use special **`system`** tenant (visible to all)

### How It Works

When viewing System Logs:
1. Fetches logs for **your current tenant**
2. Also fetches logs for **`system`** tenant (backend events)
3. Merges and displays both sets
4. Sorts by timestamp (newest first)

**Why?** Backend crashes/restarts affect all tenants, so those logs are shared.

---

## Developer Tools

### "Add Test Log" Button

**Purpose:** Development and testing only

**How it works:**
1. Select desired **Level** from dropdown (ERROR, WARNING, etc.)
2. Click **"Add Test Log"** button
3. Creates a test log of that level

**Use cases:**
- Testing log filtering
- Verifying UI displays correctly
- Populating logs for UI testing
- Demonstrating the feature

**Note:** In production, you should rely on automatic logging. This button is a developer convenience tool.

### "Clear All Logs" Button

**Purpose:** Database cleanup

**Behavior:**
- Deletes all logs for current filter settings
- Requires confirmation (cannot be undone)
- Useful for clearing old test data

---

## Database Schema

### Table: `system_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `tenant_id` | TEXT | Tenant identifier ('system' for backend logs) |
| `level` | TEXT | Log level (INFO/WARNING/ERROR/DEBUG) |
| `source` | TEXT | Origin of the log (component/service name) |
| `message` | TEXT | Human-readable log message |
| `user_email` | TEXT | Email of user who triggered event (if applicable) |
| `metadata` | JSONB | Additional structured data |
| `created_at` | TIMESTAMP | When log was created (UTC) |

### Indexes

- `idx_system_logs_tenant` - Fast tenant filtering
- `idx_system_logs_level` - Fast level filtering
- `idx_system_logs_created` - Fast timestamp sorting

---

## Real-World Examples

### Example 1: Backend Crash Detection

**Scenario:** Backend server crashes due to uncaught exception

**What happens:**
1. Uncaught exception handler in `backend/server.js` triggers
2. ERROR log created with:
   - Level: ERROR
   - Source: Backend Server
   - Message: "Uncaught exception: [error message]"
   - Metadata: Full stack trace, uptime
   - Tenant: system
3. Server exits
4. Log remains in database for post-mortem analysis

**How to find it:**
- Filter: Source = "Backend Server"
- Filter: Level = "ERROR"
- Check timestamps to correlate with downtime

### Example 2: API Error in Contact Form

**Scenario:** User tries to save contact, API returns 500 error

**What happens:**
1. API call fails in `ContactForm.jsx`
2. `handleApiError()` called from ErrorLogger
3. ERROR log created with:
   - Level: ERROR
   - Source: ContactForm
   - Message: "[ContactForm] Failed to save contact"
   - Metadata: status=500, severity=error, timestamp
   - Tenant: user's current tenant
4. Log visible immediately in System Logs UI

**How to find it:**
- Filter: Source = "ContactForm"
- Filter: Level = "ERROR"
- Search: "save contact"

### Example 3: Graceful Shutdown

**Scenario:** Admin stops backend server with Ctrl+C

**What happens:**
1. SIGTERM signal sent to Node.js process
2. SIGTERM handler in `backend/server.js` triggers
3. WARNING log created with:
   - Level: WARNING
   - Source: Backend Server
   - Message: "Backend server shutting down (SIGTERM received)"
   - Metadata: uptime_seconds, port, environment
   - Tenant: system
4. Server shuts down gracefully

**How to find it:**
- Filter: Source = "Backend Server"
- Filter: Level = "WARNING"
- Look for "shutting down" in message

---

## Troubleshooting

### "I don't see any ERROR logs, but I know errors occurred"

**Check:**
1. Are you filtering by the correct tenant?
2. Is the Level filter set to "All" or "ERROR"?
3. Did the error occur in a component that uses ErrorLogger?
4. Check browser console for errors that might not be logged

### "Timestamps show as 12/31/1969"

**Cause:** Empty `created_date` field (legacy field)

**Fix:** Already implemented - UI now uses `created_at || created_date` fallback

### "Backend logs not showing"

**Check:**
1. Verify backend is using tenant_id='system' for lifecycle logs
2. Confirm SystemLogsViewer fetches both tenant and 'system' logs
3. Check Source filter isn't hiding "Backend Server" logs

### "Too many logs, UI is slow"

**Solutions:**
1. Use filters to narrow down results
2. Use "Clear All Logs" to remove old entries
3. Consider implementing log rotation (archive old logs)
4. Database limit is 200 logs per query

---

## API Endpoints

For programmatic access or integration:

### Create Log
```http
POST /api/system-logs
Content-Type: application/json

{
  "tenant_id": "local-tenant-001",
  "level": "ERROR",
  "source": "MyComponent",
  "message": "Something went wrong",
  "user_email": "user@example.com",
  "metadata": {"key": "value"}
}
```

### Bulk Create Logs (v1.0.3+)
**Recommended for high-volume logging to reduce API traffic**

```http
POST /api/system-logs/bulk
Content-Type: application/json

{
  "logs": [
    {
      "tenant_id": "local-tenant-001",
      "level": "ERROR",
      "source": "MyComponent",
      "message": "Error 1",
      "user_email": "user@example.com",
      "metadata": {}
    },
    {
      "tenant_id": "local-tenant-001",
      "level": "WARN",
      "source": "MyComponent",
      "message": "Warning 2",
      "user_email": "user@example.com",
      "metadata": {}
    }
  ]
}

Response:
{
  "status": "success",
  "data": {
    "inserted": 2,
    "failed": 0
  }
}
```

**Client-Side Batching:** The frontend automatically batches logs using `src/utils/systemLogBatcher.js`:
- Logs enqueued in memory (max 100 entries)
- Periodic flush every 5 seconds
- Automatic flush when queue threshold reached
- Graceful fallback to single POSTs if bulk fails

### Get Logs
```http
GET /api/system-logs?tenant_id=local-tenant-001&limit=50&level=ERROR
```

### Delete All Logs (Bulk)
```http
DELETE /api/system-logs?tenant_id=local-tenant-001&level=ERROR
```

### Delete Single Log
```http
DELETE /api/system-logs/:id
```

---

## Log Level Filtering (v1.0.3+)

**Client-side log filtering** reduces unnecessary API traffic:

### Environment Variable
```bash
VITE_LOG_LEVEL=ERROR  # DEBUG|INFO|WARN|ERROR (default: ERROR)
```

### Behavior
- Only logs at or above configured level are sent to server
- Filtering happens in `src/utils/auditLog.js` before batching
- Production recommendation: `ERROR` only

### Example
```javascript
// In .env file:
VITE_LOG_LEVEL=ERROR

// These will be sent:
auditLog('ERROR', 'MyComponent', 'Critical failure', {...});

// These will be filtered out:
auditLog('INFO', 'MyComponent', 'User logged in', {...});  // Dropped
auditLog('WARN', 'MyComponent', 'Slow response', {...});   // Dropped
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/components/settings/SystemLogsViewer.jsx` | Main UI component |
| `src/components/shared/ErrorLogger.jsx` | Frontend error logging |
| `src/utils/systemLogBatcher.js` | Client-side batching utility (v1.0.3+) |
| `src/utils/auditLog.js` | Log level filtering and batching integration |
| `backend/routes/system-logs.js` | API endpoints (includes bulk) |
| `backend/server.js` | Backend lifecycle logging |
| `backend/migrations/001_init.sql` | Database schema |

---

## Best Practices

### For Developers

1. **Always use ErrorLogger** - Don't just `console.error()`, use `handleApiError()`
2. **Provide context** - Include meaningful source names and metadata
3. **Choose appropriate levels** - Reserve ERROR for actual failures
4. **Use log level filtering** - Set `VITE_LOG_LEVEL=ERROR` in production to minimize traffic
5. **Leverage batching** - Logs automatically batch; no action needed (handled by `systemLogBatcher.js`)
6. **Clear test logs** - Don't leave test data in production
7. **Monitor regularly** - Check System Logs for unexpected patterns

### For System Administrators

1. **Check logs after deployments** - Verify no ERROR logs appear
2. **Monitor Backend Server source** - Watch for crashes/restarts
3. **Configure log levels** - Production should use `VITE_LOG_LEVEL=ERROR` to reduce noise
4. **Review bulk endpoint usage** - Monitor `POST /api/system-logs/bulk` success rate
5. **Set up alerts** (future feature) - Get notified of critical errors
6. **Archive old logs** (manual for now) - Keep database performant
7. **Review ERROR logs weekly** - Identify recurring issues

---

## Future Enhancements

Potential improvements to the logging system:

- [ ] Log retention policies (auto-delete old logs)
- [ ] Export logs to CSV/JSON
- [ ] Email alerts for ERROR logs
- [ ] Log aggregation dashboard
- [ ] Performance metrics per source
- [ ] Real-time log streaming (WebSocket)
- [ ] Integration with external logging services (Sentry, LogRocket)

---

## Summary

**Key Takeaways:**

✅ Logs are **automatically created** - no manual logging needed  
✅ Four levels: INFO, WARNING, ERROR, DEBUG  
✅ Backend lifecycle events logged to 'system' tenant  
✅ Frontend errors logged via ErrorLogger.jsx  
✅ Multi-tenant isolation with system-wide backend logs  
✅ "Add Test Log" is a dev tool, not for production use  
✅ Filter by Level, Source, and free-text search  
✅ Metadata provides detailed context for debugging  

**Questions?** Check the source code files listed in the Key Files Reference section, or contact your development team.
