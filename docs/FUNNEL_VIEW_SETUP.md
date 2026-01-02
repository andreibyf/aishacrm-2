# Sales Funnel & Pipeline Materialized View Setup

## Overview

The `dashboard_funnel_counts` materialized view pre-computes entity counts for both the sales funnel AND sales pipeline dashboard widgets, reducing load time from ~3-5 seconds to <100ms by eliminating 5 separate API calls.

## Performance Impact

**Before (5 separate API calls):**
- BizDevSource.filter() - fetching up to 10,000 records
- Lead.filter() - fetching up to 10,000 records  
- Contact.filter() - fetching up to 10,000 records
- Account.filter() - fetching up to 10,000 records
- Opportunity.filter() - fetching all opportunities with amounts
- **Total: ~3000-5000ms** (3-5 seconds)

**After (1 materialized view query):**
- Single query to pre-computed counts + pipeline aggregates
- **Total: ~50-100ms** (30-50x faster!)

## Installation

### Option 1: Automatic (Recommended)

```bash
# From project root
node backend/apply-funnel-view.js
```

### Option 2: Manual (Supabase SQL Editor)

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `backend/migrations/create-funnel-counts-view.sql`
3. Execute the SQL
4. Verify with: `SELECT * FROM dashboard_funnel_counts LIMIT 5;`

## Backend Integration

### 1. Register the route in `backend/server.js`:

```javascript
import dashboardFunnelRoutes from './routes/dashboard-funnel.js';

// After other dashboard routes
app.use('/api/dashboard', dashboardFunnelRoutes);
```

### 2. API Endpoint

**GET** `/api/dashboard/funnel-counts`

Query Parameters:
- `include_test_data` (boolean, default: true)

Response:
```json
{
  "funnel": {
    "sources": 245,
    "leads": 1823,
    "contacts": 956,
    "accounts": 432
  },
  "pipeline": [
    { "stage": "Prospecting", "count": 45, "value": 125000 },
    { "stage": "Qualification", "count": 32, "value": 89000 },
    { "stage": "Proposal", "count": 18, "value": 156000 },
    { "stage": "Negotiation", "count": 12, "value": 245000 },
### Sales Funnel Widget

Update `src/components/dashboard/SalesFunnelWidget.jsx`:

```javascript
import { getFunnelCounts } from '@/api/dashboard';

// In loadCounts function:
const response = await getFunnelCounts({
  tenant_id: tenantFilter.tenant_id,
  include_test_data: showTestData
});

setCounts({
  sources: response.funnel.sources,
  leads: response.funnel.leads,
  contacts: response.funnel.contacts,
  accounts: response.funnel.accounts,
});
```

### Sales Pipeline Widget

Update `src/components/dashboard/SalesPipeline.jsx`:

```javascript
import { getFunnelCounts } from '@/api/dashboard';

// In load function:
const response = await getFunnelCounts({
  tenant_id: tenantFilter.tenant_id,
  include_test_data: showTestData
});

// response.pipeline is already in the correct format:
// [{ stage: "Prospecting", count: 45, value: 125000 }, ...]
setPipelineData(response.pipelineonst response = await getFunnelCounts({
  tenant_id: tenantFilter.tenant_id,
  include_test_data: showTestData
});

setCounts({
  sources: response.sources,
  leads: response.leads,
  contacts: response.contacts,
  accounts: response.accounts,
});
```

## Maintenance

### Refresh Strategy

**Option A: Scheduled Refresh (Recommended)**
```sql
-- Run every 5 minutes via cron job
SELECT cron.schedule(
  'refresh-funnel-counts',
  '*/5 * * * *',
  $$ SE
  tenant_slug, 
  last_refreshed, 
  sources_total, 
  leads_total,
  prospecting_count_total,
  prospecting_value_total
);
```

**Option B: On-Demand Refresh**
```bash
# Via API (admin only)
POST /api/dashboard/funnel-counts/refresh

# Or direct SQL
SELECT refresh_dashboard_funnel_counts();
```

**Option C: Real-time Triggers (High Write Volume)**
Uncomment the trigger section in the migration SQL to auto-refresh on data changes.

### Monitoring

Check last refresh time:
```sql
SELECT tenant_slug, last_refreshed, sources_total, leads_total 
FR**Funnel Counts** | | |
| sources_test/real/total | INTEGER | BizDev sources counts |
| leads_test/real/total | INTEGER | Leads counts |
| contacts_test/real/total | INTEGER | Contacts counts |
| accounts_test/real/total | INTEGER | Accounts counts |
| **Pipeline Counts** | | |
| prospecting_count_test/real/total | INTEGER | Prospecting stage counts |
| prospecting_value_test/real/total | NUMERIC | Prospecting stage amounts |
| qualification_count_test/real/total | INTEGER | Qualification stage counts |
| qualification_value_test/real/total | NUMERIC | Qualification stage amounts |
| proposal_count_test/real/total | INTEGER | Proposal stage counts |
| proposal_value_test/real/total | NUMERIC | Proposal stage amounts |
| negotiation_count_test/real/total | INTEGER | Negotiation stage counts |
| negotiation_value_test/real/total | NUMERIC | Negotiation stage amounts |
| closed_won_count_test/real/total | INTEGER | Closed Won stage counts |
| closed_won_value_test/real/total | NUMERIC | Closed Won stage amounts |
| closed_lost_count_test/real/total | INTEGER | Closed Lost stage counts |
| closed_lost_value_test/real/total | NUMERIC | Closed Lost stage amounts |
| **Metadata** | |
## Schema Details

### Columns

| Column | Type | Description |
|--------|------|-------------|
| tenant_id | UUID | Tenant UUID (PK) |
| tenant_slug | TEXT | Human-readable tenant identifier |
| sources_test | INTEGER | Test BizDev sources count |
| sources_real | INTEGER | Real BizDev sources count |
| sources_total | INTEGER | Total BizDev sources |
| leads_test | INTEGER | Test leads count |
| leads_real | INTEGER | Real leads count |
| leads_total | INTEGER | Total leads |
| contacts_test | INTEGER | Test contacts count |
| contacts_real | INTEGER | Real contacts count |
| contacts_total | INTEGER | Total contacts |
| accounts_test | INTEGER | Test accounts count |
| accounts_real | INTEGER | Real accounts count |
| accounts_total | INTEGER | Total accounts |
| last_refreshed | TIMESTAMP | Last refresh timestamp |

### Indexes

- `idx_funnel_counts_tenant_id` (UNIQUE) - Fast tenant lookups
- `idx_funnel_counts_tenant_slug` - Slug-based queries

## Troubleshooting

**Error: "relation dashboard_funnel_counts does not exist"**
- Run the migration: `node backend/apply-funnel-view.js`

**Error: "permission denied for materialized view"**
- Check RLS policies and GRANT statements in migration

**Stale data showing**
- Manually refresh: `SELECT refresh_dashboard_funnel_counts();`
- Or wait for next scheduled refresh

**Slow refresh times**
- Check index health: `REINDEX INDEX CONCURRENTLY idx_funnel_counts_tenant_id;`
- Analyze tables: `ANALYZE bizdev_sources, leads, contacts, accounts;`

## Performance Metrics

Expected query times:
- View query: 20-50ms
- Refresh (1000 records/entity): 200-500ms
- Refresh (10000 records/entity): 1-2s

Monitor with:
```sql
SELECT 
  schemaname, 
  matviewname, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
FROM pg_matviews
WHERE matviewname = 'dashboard_funnel_counts';
```
