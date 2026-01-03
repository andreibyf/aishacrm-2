# API Health Monitoring System

## Overview

The AI-SHA CRM now includes a comprehensive **self-healing API monitoring system** that automatically detects missing endpoints and provides instant fix suggestions.

## How It Works

### 1. Automatic Detection
- **All API calls** are intercepted by the health monitor
- **404 errors** are automatically logged with full context
- **First occurrence** triggers auto-analysis and notification

### 2. Auto-Analysis
When a missing endpoint is detected, the system:
- Extracts the entity name from the URL (`/api/bizdevsources` → `bizdevsources`)
- Determines the singular table name (`bizdevsources` → `bizdev_source`)
- Generates complete fix instructions including:
  - Database migration SQL
  - Backend route implementation
  - Server.js registration code
  - Frontend pluralization rule

### 3. User Notifications
- **Toast notifications** appear when endpoints are missing (can be disabled)
- **Dashboard access** at Settings → API Health
- **Copy Fix** button provides complete implementation instructions
- **Occurrence tracking** shows how many times each error happened

## Accessing the Monitor

### Settings Page
1. Navigate to **Settings**
2. Select the **API Health** tab (red Activity icon)
3. View all tracked issues

### Dashboard Features

#### Summary Cards
- **Total Missing Endpoints**: Count of unique 404 errors
- **Auto-Fix Attempts**: Number of fix suggestions generated
- **User Notifications**: Toggle on/off

#### Missing Endpoints List
Each detected endpoint shows:
- **Endpoint URL** with 404 badge
- **First/Last seen** timestamps
- **Occurrence count**
- **Auto-fix suggestion** (expandable)
  - Entity and table names
  - Step-by-step fix instructions
- **Copy Fix** button (copies full template to clipboard)
- **Context viewer** (shows API call details)

## Using the System

### Example Workflow

1. **Navigate to a page** that calls a missing endpoint (e.g., BizDev Sources)
2. **Toast notification appears**: "API endpoint not found: /api/bizdevsources"
3. **Go to Settings → API Health**
4. **Click "Copy Fix"** on the bizdevsources entry
5. **Share with AI assistant** or implement manually

### Fix Template Includes

```
API Endpoint Missing: /api/bizdevsources
Entity: bizdevsources
Table: bizdev_source

Fix Steps:
1. Check if table 'bizdev_source' exists in database
2. Create route file: backend/routes/bizdevsources.js
3. Register route in backend/server.js
4. Add pluralization rule in src/api/entities.js if needed
5. Restart backend server

Migration Template:
CREATE TABLE IF NOT EXISTS bizdev_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ
);
...

Route Registration:
import createBizDevSourceRoutes from './routes/bizdevsources.js';
app.use('/api/bizdevsources', createBizDevSourceRoutes());

**Note:** Routes now use Supabase client internally via `getSupabaseClient()` instead of pgPool parameter.

Pluralization Rule:
'bizdevsource': 'bizdevsources'
```

## Configuration

### Disable Notifications
In the API Health Dashboard:
1. Click the **User Notifications** toggle
2. System continues tracking but won't show toasts

### Auto-Refresh
- **Auto-Refresh On**: Updates every 5 seconds
- **Auto-Refresh Off**: Manual refresh only
- **Refresh Now**: Immediate update

### Clear All
Removes all tracked issues (fresh start)

## Technical Details

### Files
- **Monitor**: `src/utils/apiHealthMonitor.js`
- **Dashboard**: `src/components/settings/ApiHealthDashboard.jsx`
- **Integration**: `src/api/entities.js` (line ~42)

### API Integration
```javascript
// In entities.js
import { apiHealthMonitor } from '../utils/apiHealthMonitor';

// Report 404 errors
if (response.status === 404) {
  apiHealthMonitor.reportMissingEndpoint(url, {
    entityName,
    method,
    tenantId,
    timestamp: new Date().toISOString()
  });
}
```

### Monitor API
```javascript
import { apiHealthMonitor } from '@/utils/apiHealthMonitor';

// Report missing endpoint
apiHealthMonitor.reportMissingEndpoint(endpoint, context);

// Get health report
const report = apiHealthMonitor.getHealthReport();
// Returns: { missingEndpoints: [...], totalMissingEndpoints: N, totalFixAttempts: M }

// Clear all tracked issues
apiHealthMonitor.reset();

// Toggle user notifications
apiHealthMonitor.setReportingEnabled(true/false);
```

## Benefits

### For Developers
- **Instant awareness** of missing endpoints
- **Complete fix templates** - no guessing
- **Context preservation** - see exactly what failed
- **Reduced debugging time**

### For Users
- **Transparent errors** - know what's broken
- **Progress tracking** - see what's been fixed
- **Self-service fixes** - share with AI assistants

## Best Practices

1. **Monitor regularly**: Check Settings → API Health weekly
2. **Act on patterns**: If same endpoint fails repeatedly, prioritize fixing
3. **Share context**: Copy Fix provides full context for AI-assisted repairs
4. **Test after fixes**: Use auto-refresh to verify endpoint resolution
5. **Clean slate**: Use Clear All after fixing all issues

## Troubleshooting

### Monitor Not Detecting
- Verify you're using entity wrappers (not direct fetch)
- Check browser console for monitoring logs
- Ensure `apiHealthMonitor` is imported in `entities.js`

### Dashboard Not Loading
- Verify route is registered in Settings.jsx
- Check for import errors in ApiHealthDashboard component
- Ensure user has admin/superadmin role

### Notifications Not Showing
- Check if notifications are enabled (toggle in dashboard)
- Verify `sonner` toast provider is loaded
- Check browser notification permissions

### Why some client errors aren't in health metrics
- 4xx client validation errors (e.g., 400 Bad Request due to missing tenant_id) are considered consumer-side issues. They are intentionally excluded from "API health" degradation metrics and won't appear as outages.
- Missing endpoints (404) are tracked by the monitor since they indicate incomplete feature wiring. Use Settings → API Health to see and copy fix templates.

## Future Enhancements

Planned features:
- **Auto-PR generation**: Create GitHub PRs with fixes
- **Endpoint health scoring**: Track response times
- **Integration with CI/CD**: Auto-detect in pipelines
- **Historical tracking**: Long-term endpoint health
- **Smart retry logic**: Auto-retry failed requests

## Example: Fixing Missing Endpoint

This is exactly what we just did:

### Problem
```
[BizDev Sources Page] Backend API error: Not Found - 
{"status":"error","message":"Endpoint not found","path":"/api/bizdevsources"}
```

### Solution
1. **Monitor detected** `/api/bizdevsources` missing
2. **Generated migration**: `005_bizdev_sources.sql`
3. **Created route**: `backend/routes/bizdevsources.js`
4. **Registered route**: `app.use('/api/bizdevsources', ...)`
5. **Added pluralization**: `'bizdevsource': 'bizdevsources'`
6. **Ran migration**: `node scripts/run_migrations.js`
7. **Restarted backend**: Backend now serves 198 endpoints

### Result
✅ BizDev Sources page now loads without errors
✅ Full CRUD operations available
✅ Monitor shows 0 missing endpoints

---

**This system ensures you're never left wondering how to fix API errors!**
