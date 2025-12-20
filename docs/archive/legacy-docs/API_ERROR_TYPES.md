# Comprehensive API Error Monitoring

## Overview

The AI-SHA CRM monitors **6 critical error types** to ensure API health and rapid problem detection.

## Monitored Error Types

### 1. Missing Endpoints (404) 🔴
**What it means**: The endpoint doesn't exist on the backend

**Common causes**:
- Route not created yet
- Typo in URL
- Route not registered in server.js
- Entity pluralization mismatch

**Auto-fix available**: ✅ YES
- Migration template
- Route code template
- Registration code
- Pluralization rule

**Example**:
```
GET /api/bizdevsources → 404
Fix: Create backend/routes/bizdevsources.js and register route
```

---

### 2. Server Errors (500-599) 🟠
**What it means**: Backend crashed or encountered an internal error

**Common causes**:
- Database query errors (syntax, missing columns)
- Unhandled exceptions in route handlers
- Missing environment variables
- Database connection lost

**Auto-fix available**: ❌ NO (requires manual debugging)

**Troubleshooting steps**:
1. Check backend terminal for stack traces
2. Review server logs in system_logs table
3. Test database queries manually
4. Verify environment configuration

**Example**:
```
POST /api/contacts → 500
Error: "column 'email_address' does not exist"
Fix: Add column via migration or fix query
```

---

### 3. Authentication Errors (401/403) 🟡
**What it means**: User lacks permission or authentication is invalid

**401 Unauthorized**:
- Token expired
- No authentication provided
- Invalid credentials
- Session timeout

**403 Forbidden**:
- User lacks required role (e.g., not admin)
- Tenant mismatch
- Feature not enabled for this tier
- Permission denied

**Auto-fix available**: ❌ NO (requires policy review)

**Troubleshooting steps**:
1. Check user role and permissions
2. Verify JWT token is valid and not expired
3. Review permission rules in RouteGuard
4. Check tenant context is correct

**Example**:
```
DELETE /api/users/123 → 403
Reason: User role 'sales' cannot delete users
Fix: Require admin role or grant permission
```

---

### 4. Rate Limit Errors (429) 🔵
**What it means**: Too many requests sent to the endpoint

**Common causes**:
- Polling too frequently
- Infinite loops in frontend
- Missing request debouncing
- Multiple tabs making same calls
- Actual abuse/attack

**Auto-fix available**: ❌ NO (requires rate limiting review)

**Troubleshooting steps**:
1. Implement request debouncing
2. Add caching layer
3. Reduce polling frequency
4. Use websockets for real-time updates
5. Review rate limit thresholds

**Example**:
```
GET /api/notifications → 429
Polling every 100ms (10 req/sec)
Fix: Reduce to 1 req/30sec or use websocket
```

---

### 5. Timeout Errors ⏱️
**What it means**: Request took too long to complete

**Common causes**:
- Slow database queries (missing indexes)
- Large result sets without pagination
- External API calls timing out
- Resource-intensive operations
- Network congestion

**Auto-fix available**: ❌ NO (requires performance optimization)

**Troubleshooting steps**:
1. Add database indexes on filtered columns
2. Implement pagination
3. Optimize queries (use EXPLAIN)
4. Add request timeout limits
5. Use background jobs for slow operations

**Example**:
```
GET /api/reports/annual → TIMEOUT
Query scans 1M rows without index
Fix: Add index on date column, implement pagination
```

---

### 6. Network Errors 🌐
**What it means**: Failed to connect to backend server

**Common causes**:
- Backend server not running
- Wrong port or URL
- CORS issues
- DNS failure
- Firewall blocking

**Auto-fix available**: ❌ NO (requires infrastructure check)

**Troubleshooting steps**:
1. Verify backend is running (`status.ps1`)
2. Check backend URL in `.env`
3. Test connectivity: `curl http://localhost:3001/api/health`
4. Review CORS configuration
5. Check firewall rules

**Example**:
```
GET /api/accounts → Network Error
Backend server not running
Fix: Run `start-all.ps1` or `cd backend; node server.js`
```

---

## Error Severity Levels

| Error Type | Severity | Impact | Response Time |
|------------|----------|---------|---------------|
| Network | 🔴 CRITICAL | App unusable | Immediate |
| Server (5xx) | 🔴 CRITICAL | Feature broken | Urgent |
| Missing (404) | 🟠 HIGH | Feature unavailable | Within hours |
| Timeout | 🟠 HIGH | Poor UX | Within day |
| Auth (401/403) | 🟡 MEDIUM | Access denied | Review needed |
| Rate Limit (429) | 🟡 MEDIUM | Temporary block | Optimization needed |

---

## Dashboard Features

### Summary Cards
Six colored cards show count for each error type:
- 🔴 Red: Missing (404)
- 🟠 Orange: Server (5xx)
- 🟡 Yellow: Auth (401/403)
- 🔵 Blue: Rate Limit (429)
- 🟣 Purple: Timeouts
- ⚫ Gray: Network

### Error Lists
Each error type has its own section with:
- Endpoint URL
- Error code badge
- First/last seen timestamps
- Occurrence count
- Error description
- Context details (expandable)
- Copy Fix button (for 404s only)

### Controls
- **Auto-Refresh**: Updates every 5 seconds
- **Refresh Now**: Manual update
- **Clear All**: Reset all tracking
- **Notifications Toggle**: Enable/disable toasts

---

## Best Practices

### 1. Monitor Regularly
Check Settings → API Health:
- **Daily** during development
- **Weekly** in production
- **After deployments** always

### 2. Prioritize by Severity
1. Fix CRITICAL errors immediately
2. Address HIGH errors within hours
3. Review MEDIUM errors weekly

### 3. Look for Patterns
- Same endpoint failing repeatedly? Prioritize fix
- Errors after specific user actions? Add logging
- Timeouts at specific times? Check server load

### 4. Document Fixes
When resolving errors:
1. Note the root cause
2. Document the solution
3. Update API health docs
4. Share with team

### 5. Proactive Monitoring
Don't wait for user reports:
- Set up alerts for new errors
- Review dashboard in daily standup
- Track error trends over time

---

## Integration with Development Workflow

### When Errors Occur
1. **Toast appears** with error type and endpoint
2. **Console logs** full context for debugging
3. **Dashboard tracks** all occurrences
4. **Fix template** available (for 404s)

### During Development
```bash
# Check API health before committing
1. Navigate to Settings → API Health
2. Verify no new errors
3. Clear resolved issues
4. Commit changes
```

### Before Deployment
```bash
# Pre-deployment checklist
✓ Zero CRITICAL errors
✓ All HIGH errors documented/tracked
✓ No new 404s
✓ Rate limits tested
✓ Timeout scenarios covered
```

---

## Example Scenarios

### Scenario 1: New Feature with Missing Endpoint
```
User Action: Opens new "Campaigns" page
Result: Toast "Missing endpoint: /api/campaigns"
Solution:
1. Go to Settings → API Health
2. Click "Copy Fix" on /api/campaigns
3. Share with AI assistant
4. AI creates migration + routes
5. Test and verify
```

### Scenario 2: Database Performance Issue
```
User Action: Loads large report
Result: Multiple timeout errors
Solution:
1. Check Timeouts section in dashboard
2. Identify slow endpoint
3. Review database query
4. Add indexes or pagination
5. Monitor improvement
```

### Scenario 3: Authentication Problem
```
User Action: Admin tries to delete user
Result: 403 Forbidden error
Solution:
1. Check Auth Errors section
2. Review user role and permissions
3. Update permission rules
4. Test with different roles
5. Document access requirements
```

---

## Technical Implementation

### Monitoring Code
```javascript
// In entities.js
try {
  response = await fetch(url, options);
} catch (error) {
  apiHealthMonitor.reportNetworkError(url, context);
}

if (response.status === 404) {
  apiHealthMonitor.reportMissingEndpoint(url, context);
} else if (response.status >= 500) {
  apiHealthMonitor.reportServerError(url, response.status, context);
}
// ... more checks
```

### Custom Error Reporting
```javascript
import { apiHealthMonitor } from '@/utils/apiHealthMonitor';

// Report custom errors
apiHealthMonitor.reportTimeoutError('/api/longOperation', {
  duration: 30000,
  expectedDuration: 5000
});
```

---

## Troubleshooting the Monitor

### Monitor Not Working
1. Check `apiHealthMonitor` is imported in `entities.js`
2. Verify error reporting code is active
3. Check browser console for monitor logs
4. Ensure dashboard component is loaded

### Dashboard Not Loading
1. Verify import in Settings.jsx
2. Check user has admin role
3. Review browser console for errors
4. Clear browser cache

### Notifications Not Showing
1. Check notification toggle is ON
2. Verify sonner toast provider loaded
3. Test with known failing endpoint
4. Check browser notification settings

---

**This comprehensive monitoring ensures no API issue goes unnoticed!** 🎯
