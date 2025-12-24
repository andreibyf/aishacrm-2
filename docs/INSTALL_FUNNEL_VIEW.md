# Install Dashboard Funnel & Pipeline Materialized Views

## Step 1: Run SQL in Supabase

1. **Open Supabase Dashboard** → SQL Editor
2. **Copy the ENTIRE contents** of `backend/migrations/create-funnel-counts-view.sql`
3. **Paste and Execute** in SQL Editor
4. **Verify success**: You should see "Success. No rows returned"

## Step 2: Verify the Views Were Created

Run this query in Supabase SQL Editor:

```sql
-- Check if views exist
SELECT 
  schemaname, 
  matviewname, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
FROM pg_matviews
WHERE matviewname IN ('dashboard_funnel_counts', 'dashboard_funnel_counts_by_period');
```

**Expected result**: 2 rows showing both views

## Step 3: Test the Views

```sql
-- Test all-time view
SELECT * FROM dashboard_funnel_counts LIMIT 1;

-- Test period view (recent data)
SELECT * FROM dashboard_funnel_counts_by_period 
WHERE period_date >= CURRENT_DATE - INTERVAL '7 days'
LIMIT 10;
```

## Step 4: Register the API Route

Add to `backend/server.js` (around line 80-100 with other route imports):

```javascript
// Import the route
import dashboardFunnelRoutes from './routes/dashboard-funnel.js';

// Register the route (around line 200-250 with other app.use statements)
app.use('/api/dashboard', dashboardFunnelRoutes);
```

## Step 5: Restart Backend

```bash
docker compose restart backend
```

## Step 6: Test the API Endpoint

```bash
# Should return funnel + pipeline data
curl http://localhost:4001/api/dashboard/funnel-counts

# Test with period filter
curl "http://localhost:4001/api/dashboard/funnel-counts?period=year&year=2025"
```

## Troubleshooting

### "materialized view does not exist"
- Go back to Step 1 - the SQL didn't execute successfully
- Check for syntax errors in the Supabase SQL Editor output

### "Could not find the table in schema cache"
- Wait 30 seconds for Supabase to rebuild its cache
- Try: `SELECT pg_sleep(5); SELECT * FROM dashboard_funnel_counts;`

### API returns 500 error
- Check `docker logs aishacrm-backend -f` for errors
- Verify Step 4 was completed correctly
- Ensure backend restarted successfully

### Empty data returned
- Run: `SELECT refresh_dashboard_funnel_counts();` to populate the views
- Check that you have data in `bizdev_sources`, `leads`, `contacts`, `accounts`, `opportunities` tables

## Optional: Setup Auto-Refresh

Run this in Supabase SQL Editor to refresh every 5 minutes:

```sql
SELECT cron.schedule(
  'refresh-dashboard-funnel-counts',
  '*/5 * * * *',
  $$ SELECT refresh_dashboard_funnel_counts(); $$
);
```

Or manually refresh anytime:
```sql
SELECT refresh_dashboard_funnel_counts();
```
