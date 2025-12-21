# Bulk Delete Operations with Time-Based Filters

## Overview
This document explains how bulk delete operations with time-based filters work in the CRM system, particularly when using the Supabase API mode.

## Problem Statement
When using Supabase API mode (instead of direct PostgreSQL connection), the system uses a query translator in `backend/lib/supabase-db.js` to convert SQL queries to Supabase API calls. 

Previously, time-based DELETE queries like this would fail:
```sql
DELETE FROM system_logs WHERE created_at > NOW() - INTERVAL '1 hours'
DELETE FROM performance_logs WHERE created_at > NOW() - $1::INTERVAL
```

**Error:**
```
Unsafe DELETE without supported filters in API mode
```

## Solution
Extended the query translator to support time-based filters for bulk delete operations.

## Supported Time Filter Patterns

### 1. Parameterized Interval (Recommended)
```sql
DELETE FROM table_name WHERE created_at > NOW() - $1::INTERVAL
```

**Example:**
```javascript
const query = `DELETE FROM performance_logs WHERE created_at > NOW() - $1::INTERVAL`;
const params = ['24 hours'];
await pool.query(query, params);
```

**Supported units:**
- `N hours` (e.g., `'1 hours'`, `'24 hours'`)
- `N days` (e.g., `'7 days'`, `'30 days'`)
- `N minutes` (e.g., `'30 minutes'`)
- `N weeks` (e.g., `'2 weeks'`)

### 2. Literal Interval (Static queries)
```sql
DELETE FROM table_name WHERE created_at > NOW() - INTERVAL '1 hours'
DELETE FROM table_name WHERE created_at < NOW() - INTERVAL '30 days'
```

**Example:**
```javascript
const query = `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'`;
await pool.query(query, []);
```

### 3. Combined with Other Filters
```sql
DELETE FROM system_logs 
WHERE created_at > NOW() - INTERVAL '1 hours' 
  AND tenant_id = $1
  AND level = $2
```

**Example:**
```javascript
const query = `DELETE FROM system_logs 
  WHERE created_at > NOW() - INTERVAL '1 hours' 
  AND tenant_id = $1 
  AND level = $2`;
const params = ['tenant-123', 'error'];
await pool.query(query, params);
```

## Route Examples

### System Logs Cleanup
**Endpoint:** `DELETE /api/system-logs?hours=1`

**Route Implementation:**
```javascript
router.delete("/", async (req, res) => {
  const { tenant_id, level, hours } = req.query;

  let query = "DELETE FROM system_logs WHERE 1=1";
  const values = [];

  if (hours) {
    query += ` AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'`;
  }

  if (tenant_id) {
    query += ` AND tenant_id = $${values.length + 1}`;
    values.push(tenant_id);
  }

  // Note: This example shows old pgPool pattern.
  // Current implementation uses Supabase with client-side date filtering:
  // const cutoffDate = new Date();
  // cutoffDate.setHours(cutoffDate.getHours() - hours);
  // await supabase.from(table).delete().eq('tenant_id', tenant_id).lt('created_at', cutoffDate.toISOString());
  const result = await pgPool.query(query, values);
  // Returns deleted count
});
```

### Performance Logs Cleanup
**Endpoint:** `DELETE /api/metrics/performance?hours=24`

**Route Implementation:**
```javascript
router.delete('/performance', async (req, res) => {
  const { tenant_id, hours = 24 } = req.query;
  
  // Current Supabase implementation:
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  
  let query = supabase
    .from('performance_logs')
    .delete()
    .lt('created_at', cutoffDate.toISOString())
    .select();
  
  if (tenant_id) {
    query = query.eq('tenant_id', tenant_id);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  // Returns deleted records
});
```

## Query Translator Details

The translator in `backend/lib/supabase-db.js` converts time filters to Supabase API calls:

**SQL → Supabase API:**
```javascript
// SQL: created_at > NOW() - INTERVAL '24 hours'
// Translates to:
query.gt('created_at', '2025-11-04T19:00:00.000Z')

// SQL: created_at < NOW() - INTERVAL '30 days'  
// Translates to:
query.lt('created_at', '2025-10-06T00:00:00.000Z')
```

## Safety Features

### 1. Required Filters
All DELETE queries MUST have at least one filter. Full table deletes are blocked:

```javascript
// ❌ This will fail:
DELETE FROM system_logs

// ✅ This will work:
DELETE FROM system_logs WHERE created_at > NOW() - INTERVAL '1 hours'
```

### 2. 1=1 Placeholder
The `WHERE 1=1` pattern is recognized and ignored (used for dynamic query building):

```javascript
let query = "DELETE FROM system_logs WHERE 1=1";
// The "1=1" is skipped, actual filters are required
```

### 3. Applied Filters Counter
The translator tracks applied filters. If zero filters are successfully applied, the delete is blocked.

## Troubleshooting

### Error: "Unsafe DELETE without supported filters"
**Cause:** The query has no recognized filters or all filters failed to parse.

**Solutions:**
1. Ensure time filter uses supported syntax
2. Add at least one filter (timestamp, tenant_id, etc.)
3. Check parameter indices match query placeholders

### Error: "Could not parse DELETE"
**Cause:** Query syntax doesn't match expected patterns.

**Solutions:**
1. Use `DELETE FROM table_name` format
2. Include `WHERE` clause
3. Follow supported filter patterns

### Time Filter Not Working
**Check:**
1. Interval format: `'N hours'` or `'N days'` (with units spelled out)
2. Parameter indices: `$1`, `$2`, etc. must be 1-based
3. Case sensitivity: `NOW()`, `INTERVAL` are case-insensitive

## Testing

### Manual API Test
```powershell
# Delete system logs older than 1 hour
Invoke-RestMethod -Uri 'http://localhost:3001/api/system-logs?hours=1' -Method Delete

# Delete performance logs older than 24 hours
Invoke-RestMethod -Uri 'http://localhost:3001/api/metrics/performance?hours=24' -Method Delete
```

### Expected Response
```json
{
  "status": "success",
  "message": "Deleted 15 system log(s)",
  "data": {
    "deleted_count": 15
  }
}
```

### Error Response (if no filters applied)
```json
{
  "status": "error",
  "message": "Unsafe DELETE without supported filters in API mode"
}
```

## Future Enhancements

Potential additions to the query translator:

1. **Date range filters:**
   ```sql
   created_at BETWEEN $1 AND $2
   ```

2. **IN clauses:**
   ```sql
   tenant_id IN ($1, $2, $3)
   ```

3. **LIKE patterns:**
   ```sql
   message LIKE '%error%'
   ```

4. **NULL checks:**
   ```sql
   tenant_id IS NULL
   ```

## Related Files
- `backend/lib/supabase-db.js` - Query translator implementation
- `backend/routes/system-logs.js` - System logs cleanup endpoint
- `backend/routes/metrics.js` - Performance logs cleanup endpoint
- `backend/test-time-deletes.js` - Test suite for time-based deletes

## See Also
- [Database Security Best Practices](./DATABASE_SECURITY.md)
- [API Error Handling](./API_ERROR_TYPES.md)
- [Performance Monitoring](./PERFORMANCE_MONITORING_GUIDE.md)

---

**Last Updated:** November 5, 2025  
**Fixed In:** Commit [hash]  
**Status:** ✅ Production Ready
