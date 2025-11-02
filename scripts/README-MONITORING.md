# Railway Backend Monitoring Guide

This directory contains tools for monitoring Railway backend health and database logging.

## Quick Start

### 1. Install Railway CLI (if not already installed)

```powershell
npm install -g @railway/cli
railway login
```

### 2. Link to Your Project

```powershell
cd c:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53
railway link
```

Select your AishaCRM project when prompted.

### 3. Run the Log Monitor

```powershell
# Fetch and analyze last 200 lines
.\scripts\monitor-railway-logs.ps1

# Fetch more history
.\scripts\monitor-railway-logs.ps1 -Lines 500

# Continuous monitoring (like tail -f)
.\scripts\monitor-railway-logs.ps1 -Follow
```

## What the Monitor Checks

The log monitoring script analyzes logs for:

### ✅ Good Signs
- **Successful Startups**: Backend started with IPv4 DNS resolution
- **Database Connections**: Stable Postgres connections
- **System Logging**: Audit trail entries being written
- **Graceful Shutdowns**: Clean SIGTERM handling

### ❌ Red Flags to Watch For
- **IPv6 Errors**: `ENETUNREACH`, IPv6 connection attempts (should be zero after IPv4 fix)
- **Database Errors**: Connection failures, timeouts, pool exhaustion
- **500 Errors**: High rate of server errors
- **Auth Failures**: Persistent 401/authentication issues

## Database Logging Verification

### Check via SQL (Supabase)

1. Open Supabase SQL Editor
2. Run queries from `scripts/check-system-logs.sql`
3. Look for recent backend events in results

Key queries:
```sql
-- Quick health check
SELECT COUNT(*) FROM system_logs 
WHERE source = 'Backend Server' 
AND created_at > NOW() - INTERVAL '1 hour';
```

Expected result after enabling logging:
- **> 0**: Logging is working ✅
- **0**: DISABLE_DB_LOGGING still true or no recent deploys ⚠️

### Check via Railway Dashboard

1. Go to Railway → Backend Service → Logs
2. Look for: `"logBackendEvent"` or `"INSERT INTO system_logs"`
3. Should see entries on startup/shutdown

## Monitoring Schedule

### Daily (Automated - Use Task Scheduler)
```powershell
# Add to Windows Task Scheduler to run daily
.\scripts\monitor-railway-logs.ps1 -Lines 500 > "logs\railway-check-$(Get-Date -Format 'yyyy-MM-dd').txt"
```

### Weekly (Manual Review)
1. Run monitor script
2. Review critical error counts
3. Check Supabase system_logs table
4. Verify no IPv6/ENETUNREACH errors

### After Each Deploy
```powershell
# Wait 2-3 min for deploy, then check
.\scripts\monitor-railway-logs.ps1 -Lines 100
```

Look for:
- "IPv4 address resolved for Supabase" ✅
- "Backend server started successfully" ✅
- No ENETUNREACH errors ✅

## Interpreting Results

### Example: Healthy Backend
```
📊 Log Analysis Report
============================================================

🔍 Pattern Match Summary:

  ✅ IPv6/ENETUNREACH Errors: 0 matches
  ✅ Database Connection Errors: 0 matches
  ✅ Successful Startups: 3 matches
  ⚠️ Graceful Shutdowns: 2 matches
  ⚠️ System Logging Activity: 15 matches

🌐 IPv4 Stability Status:
────────────────────────────────────────────────────────────
  ✅ IPv4 DNS fix working correctly - no IPv6 errors detected
  ✅ Database connections stable - no connection errors
  ℹ️  3 successful startup(s) detected

💡 Recommendations:
────────────────────────────────────────────────────────────
  ✅ Backend looks healthy - continue monitoring
```

### Example: Needs Attention
```
⚠️  CRITICAL: IPv6/ENETUNREACH Errors (5 found)
────────────────────────────────────────────────────────────
  1. Error: connect ENETUNREACH ::1:5432
  2. IPv6 connection attempt failed...

💡 Recommendations:
────────────────────────────────────────────────────────────
  • Review IPv4 DNS configuration in backend/server.js
  • Check if Supabase host resolution is using IPv6 fallback
```

## Troubleshooting

### "Railway CLI not found"
```powershell
npm install -g @railway/cli
railway login
```

### "Not in a Railway project"
```powershell
railway link  # Select your project
```

### "No logs retrieved"
- Check Railway CLI is authenticated: `railway whoami`
- Verify service is running: Check Railway dashboard
- Try with explicit service: `.\scripts\monitor-railway-logs.ps1 -ServiceId "your-service-id"`

### System logs empty in Supabase
1. Check `DISABLE_DB_LOGGING` in Railway env vars (should be `false` or deleted)
2. Verify `system_logs` table exists
3. Check backend logs for "Failed to log backend event" errors
4. Wait for next deploy/restart to trigger logging

## Files

- `monitor-railway-logs.ps1` - PowerShell log analyzer
- `check-system-logs.sql` - Supabase SQL queries for audit verification
- `README-MONITORING.md` - This guide

## Next Steps After Monitoring Period

After 3-7 days of monitoring:

1. **If no IPv6 errors**: Mark IPv4 fix as ✅ complete
2. **If system_logs populated**: Mark DB logging as ✅ working
3. **If issues found**: Review recommendations and adjust backend config
4. **Document findings**: Update main README with stability notes

---

**Related Docs:**
- `backend/README.md` - Backend architecture
- `backend/TROUBLESHOOTING_NODE_ESM.md` - ESM debugging
- `DEV_QUICK_START.md` - Development setup
