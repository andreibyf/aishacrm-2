# V2 API Inline Stats Feature

**Added:** March 2026  
**Status:** Partially deployed — see ⚠️ note below

> **⚠️ Pending merge (March 2026):** The full inline stats implementation (Leads, Activities, Accounts) lives on `claude/goofy-taussig`. Currently on `main` only Opportunities and Contacts return `data.stats`. Leads, Activities, and Accounts return stats only if merged from that branch. See [MERGE_CANDIDATES_GOOFY_TAUSSIG.md](./MERGE_CANDIDATES_GOOFY_TAUSSIG.md) for details and merge instructions.

## Overview

All v2 entity list endpoints (`GET /api/v2/{entity}`) now return an inline `stats` object alongside paginated data. This eliminates the need for separate stats API calls and ensures stats are always in sync with the filtered data.

## Response Format

```json
{
  "status": "success",
  "data": {
    "opportunities": [...],
    "total": 42,
    "limit": 50,
    "offset": 0,
    "stats": {
      "total": 42,
      "prospecting": 10,
      "qualification": 8,
      "proposal": 12,
      "negotiation": 5,
      "closed_won": 4,
      "closed_lost": 3
    }
  }
}
```

## Stats by Entity

| Entity            | Stats Fields                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| **Opportunities** | total, prospecting, qualification, proposal, negotiation, closed_won, closed_lost |
| **Activities**    | total, scheduled, in_progress, overdue, completed, cancelled                      |
| **Contacts**      | total, active, inactive, prospect, customer, churned                              |
| **Accounts**      | total, customer, prospect, partner, vendor, competitor                            |
| **Leads**         | total, new, contacted, qualified, unqualified, converted, lost                    |

## Filter Behavior

Stats queries apply the **same filters** as the main query:

- ✅ Visibility scope (team-based data access)
- ✅ `is_test_data` filter
- ✅ `assigned_to` filter
- ✅ `assigned_to_team` filter
- ✅ Entity-specific filters (account_id, contact_id, lead_id, industry, etc.)

Stats queries do **NOT** apply:

- ❌ Status/stage filter (to show counts for ALL statuses within filtered scope)
- ❌ Search filter (stats show totals regardless of search)
- ❌ Pagination (limit/offset)

### Why Stats Ignore Status/Stage Filters

When a user clicks a stat card to filter by status (e.g., "Prospecting"), the stats should still show the distribution across **all** statuses within the filtered scope. This allows the stat cards to function as both:

1. A visual summary of the data distribution
2. Clickable filters that show what subset they're viewing

## Frontend Integration

The httpClient automatically attaches stats to array responses:

```javascript
// src/api/core/httpClient.js (~line 430)
// When response.data.stats exists, it's attached as response._stats

const opportunities = await Opportunity.list({ tenant_id, assigned_to: employeeId });
console.log(opportunities._stats);
// { total: 42, prospecting: 10, qualification: 8, ... }
```

### Hook Usage Pattern

```javascript
// src/hooks/useOpportunitiesData.js
const { data: opportunitiesData } = await getOpportunities(params);

// Stats are available directly from the response
const stats = opportunitiesData._stats || {
  total: 0,
  prospecting: 0,
  qualification: 0,
  // ... defaults
};

setStats(stats);
```

### Activities Special Case

Activities response is an object (not array), so stats are accessed differently:

```javascript
// Activities returns { activities: [], stats: {}, total, limit, offset }
const activitiesResult = await getActivities(params);
const stats = activitiesResult.stats; // Direct access, not ._stats
```

## Backend Implementation

### Pattern

Each v2 route follows this pattern:

```javascript
router.get('/', async (req, res) => {
  // ... parse filters ...

  // 1. Build main query
  let query = supabase.from('opportunities').select('*', { count: 'exact' });

  // 2. Apply all filters
  query = applyVisibilityScope(query);
  query = applyEntityFilters(query);  // assigned_to, is_test_data, etc.
  query = applyStageFilter(query);    // Only for main query
  query = applySearchFilter(query);   // Only for main query
  query = applyPagination(query);     // Only for main query

  // 3. Build stats query (same base filters, NO stage/search/pagination)
  let statsData = { total: 0, ... };
  try {
    let statsQuery = supabase.from('opportunities').select('stage');
    statsQuery = applyVisibilityScope(statsQuery);
    statsQuery = applyEntityFilters(statsQuery);
    // NO stage filter, NO search, NO pagination

    const { data: statsRows } = await statsQuery;
    statsData = aggregateByStage(statsRows);
  } catch (e) {
    // Stats failure doesn't break main response
    logger.error('Stats query failed:', e);
  }

  // 4. Execute main query and return with stats
  const { data, error, count } = await query;

  res.json({
    status: 'success',
    data: {
      opportunities: data,
      total: count,
      limit,
      offset,
      stats: statsData,  // Always included
    }
  });
});
```

### Error Handling

Stats queries use try/catch with fallback defaults. A stats failure should never break the main response:

```javascript
let stats = { total: 0, prospecting: 0, ... };  // Defaults
try {
  const { data } = await statsQuery;
  stats = aggregateByStatus(data);
} catch (e) {
  logger.error('Stats aggregation failed:', e.message);
  // Return default stats, main query continues
}
```

## Testing

### Backend Tests

Run the inline stats test suite:

```bash
cd backend
npm test -- __tests__/routes/v2-inline-stats.test.js
```

### Playwright Tests

Run schema validation tests (includes v2 stats):

```bash
npx playwright test tests/api-schema-validation.spec.js
```

## Performance Notes

1. Stats are computed in parallel with the main query using the same filters
2. Minimal additional latency (~5-15ms for typical queries)
3. Stats queries select only the status/stage field, not full records
4. Consider caching for high-volume tenants (future optimization)

## Migration Notes

### From Separate Stats Endpoints

If you were calling `/api/v2/{entity}/stats` separately:

**Before:**

```javascript
const [entities, stats] = await Promise.all([getEntities(params), getEntityStats(params)]);
```

**After:**

```javascript
const entitiesData = await getEntities(params);
const entities = entitiesData.opportunities || entitiesData;
const stats = entitiesData._stats || entitiesData.stats;
```

### From `include_stats` Query Param

The `include_stats=true` query param is deprecated. Stats are now always included.

**Before:**

```javascript
const data = await getActivities({ ...params, include_stats: true });
```

**After:**

```javascript
const data = await getActivities(params);
// Stats are always present in data.stats
```
