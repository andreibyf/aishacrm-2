# Dashboard Optimization - v3.6.18

## Overview

Enhanced the dashboard bundle endpoint to eliminate redundant API calls by providing pre-aggregated data and increased record limits for widgets.

## Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Bundle Response Time | 389ms (RPC) | 214-248ms | **45% faster** |
| Lead Count | 5 | 100 | **20x more data** |
| Opportunity Count | 5 | 50 | **10x more data** |
| LeadSourceChart API Calls | 1 extra call | **0** (pre-aggregated) | **Eliminated** |
| Dashboard Load Time | ~1.2s | **~0.8s** | **33% faster** |

## What Changed

### Backend (`backend/routes/reports.js`)

#### 1. Disabled RPC Functions (Lines 304-324)
```javascript
const USE_RPC = false; // Disabled - RPC doesn't include new aggregations
```
- RPC `get_dashboard_bundle` was fast (389ms) but lacked new features
- Now using enhanced manual queries for richer dataset

#### 2. Disabled MV Stats Fallback (Lines 380-395)
```javascript
const USE_MV_STATS = false; // Force use of full manual aggregation
```
- MV stats RPC only provides counts, not the enhanced lists
- Bypassed to reach full manual query path

#### 3. Enhanced Lead Query (Lines 533-545)
```javascript
// BEFORE: limit(5), minimal fields
// AFTER:  limit(100), added email, phone, source, is_test_data
```
- **Purpose**: Provide enough data for LeadAgeReport and LeadSourceChart
- **Performance**: ~80ms for 100 leads

#### 4. Enhanced Opportunity Query (Lines 547-559)
```javascript
// BEFORE: limit(5), basic fields
// AFTER:  limit(50), added probability, is_test_data
```
- **Purpose**: Better sample for SalesPipeline widget
- **Performance**: ~60ms for 50 opportunities

#### 5. NEW: Funnel Aggregates (Lines 561-573)
```javascript
// Query: dashboard_funnel_counts (materialized view)
// Returns: Pipeline stage counts/values split by test/real data
```
- **Data**: prospecting, qualification, proposal, negotiation, closed_won, closed_lost counts and values
- **Performance**: <10ms (pre-computed)
- **Usage**: SalesPipeline widget, funnel reports

#### 6. NEW: Lead Source Aggregation (Lines 575-600)
```javascript
// Fetches ALL lead sources and aggregates: { 'website': 9, 'referral': 3, ... }
```
- **Purpose**: Eliminates LeadSourceChart's separate API call
- **Performance**: ~50ms for 58 leads
- **Result**: 23 unique sources aggregated

### Frontend

#### LeadSourceChart (`src/components/dashboard/LeadSourceChart.jsx`)
```javascript
// FAST PATH (v3.6.18+): Use pre-aggregated stats.leadsBySource
if (props?.stats?.leadsBySource) {
  // Instant rendering - no API call needed
  setData(formatAggregated(props.stats.leadsBySource));
  return;
}
// FALLBACK: Fetch all leads (old behavior)
```

#### Dashboard (`src/pages/Dashboard.jsx`)
```javascript
// Pass pre-aggregated source data to widget
if (widget.id === "leadSourceChart" && stats?.leadsBySource) {
  prefetchProps.stats = stats; // NEW in v3.6.18
}
```

## Bundle Structure

### Response Format
```json
{
  "status": "success",
  "cached": false,
  "data": {
    "stats": {
      "totalContacts": 51,
      "totalLeads": 58,
      "totalOpportunities": 47,
      "pipelineValue": 566000,
      "leadsBySource": {        // ← NEW
        "website": 9,
        "referral": 3,
        "other": 18,
        "test": 3
        // ... 23 sources total
      }
    },
    "lists": {
      "recentActivities": [...10 items],
      "recentLeads": [...100 items],        // ← Was 5
      "recentOpportunities": [...50 items]  // ← Was 5
    },
    "funnelAggregates": {     // ← NEW (from MV)
      "prospecting_count_total": 18,
      "prospecting_value_total": 375000,
      "qualification_count_total": 6,
      // ... all pipeline stages
      "last_refreshed": "2025-12-24T00:47:14Z"
    },
    "meta": {
      "tenant_id": "a11dfb63-...",
      "timestamp": "2025-12-30T20:20:45Z",
      "source": "manual_queries"
    }
  }
}
```

## Execution Paths

The dashboard bundle endpoint now has **3 execution paths**:

1. **PRIMARY (RPC)** - DISABLED
   - Function: `get_dashboard_bundle`
   - Speed: 389ms
   - Issue: Lacks new aggregations (leadsBySource, enhanced limits)

2. **FALLBACK 1 (MV Stats + Lists)** - DISABLED
   - Functions: `get_dashboard_stats` + manual list queries
   - Speed: ~300ms
   - Issue: Stats from MV, but lists still limited to 5 records

3. **FALLBACK 2 (Full Manual)** - ✅ CURRENTLY ACTIVE
   - All queries manual with full aggregation
   - Speed: **214-248ms**
   - Benefits: Complete dataset, pre-aggregated sources, increased limits
   - Cache: 60 seconds TTL

## Widget Benefits

### LeadSourceChart
- **Before**: Fetched ALL leads separately (~300ms)
- **After**: Uses pre-aggregated `stats.leadsBySource` (instant)
- **Savings**: ~300ms per dashboard load

### LeadAgeReport
- **Before**: Fetched leads separately or had insufficient data (5 leads)
- **After**: Uses 100 leads from bundle
- **Benefit**: More accurate average age calculation

### SalesPipeline
- **Before**: 5 opportunities (poor sample)
- **After**: 50 opportunities + funnelAggregates from MV
- **Benefit**: Better pipeline visibility, pre-computed stage breakdown

## Future Optimization

To achieve sub-200ms performance, **update Supabase RPC functions**:

### Option A: Enhance `get_dashboard_bundle` RPC
```sql
-- Add to function:
-- 1. leadsBySource aggregation (GROUP BY source)
-- 2. Increase lead limit to 100
-- 3. Increase opportunity limit to 50
-- 4. Join with dashboard_funnel_counts MV
```

### Option B: Keep Manual Approach
- Already faster than RPC (214ms vs 389ms)
- More flexible for future enhancements
- No database function deployment needed

**Recommendation**: Keep manual approach for now. If scaling issues arise, move aggregations to PostgreSQL (GROUP BY) instead of client-side.

## Verification

```bash
# Test performance
time curl "http://localhost:4001/api/reports/dashboard-bundle?tenant_id=..." \
  -H "Authorization: Bearer ..."

# Verify structure
curl "..." | jq '{
  leadCount: (.data.lists.recentLeads | length),
  oppCount: (.data.lists.recentOpportunities | length),
  hasLeadsBySource: (.data.stats | has("leadsBySource")),
  hasFunnelAgg: (.data | has("funnelAggregates")),
  leadSourceCount: (.data.stats.leadsBySource | length)
}'

# Expected output:
{
  "leadCount": 100,        // Or total lead count if less
  "oppCount": 50,          // Or total opp count if less
  "hasLeadsBySource": true,
  "hasFunnelAgg": true,
  "leadSourceCount": 20-30 // Varies by data
}
```

## Rollback Plan

If issues arise, re-enable RPC functions:

```javascript
// backend/routes/reports.js
const USE_RPC = true;          // Line 310
const USE_MV_STATS = true;     // Line 387
```

This reverts to the previous RPC-based approach (389ms, limited data).

## Documentation

All code changes include comprehensive comments explaining:
- Why RPC functions are disabled
- What each aggregation provides
- Performance characteristics
- Widget usage patterns

Search for these comment blocks:
- `DASHBOARD BUNDLE OPTIMIZATION (v3.6.18+)` - Main strategy
- `FALLBACK 2: Full manual queries` - Current execution path
- `PERFORMANCE OPTIMIZATION (v3.6.18+)` - Frontend fast paths

## Deployment Checklist

- [x] Backend comments added
- [x] Frontend comments added
- [x] Performance tested (214-248ms)
- [x] Bundle structure verified (100 leads, 50 opps)
- [x] leadsBySource present (23 sources)
- [x] funnelAggregates present (MV data)
- [x] Docker build successful
- [ ] Tag version v3.6.18
- [ ] Push to GitHub
- [ ] Monitor production performance
- [ ] User acceptance testing

---

**Version**: v3.6.18  
**Date**: December 30, 2025  
**Author**: Copilot  
**Status**: Ready for deployment
