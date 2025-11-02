# Railway IPv4-Only DNS Fix

## Problem
Railway's network infrastructure **does not support IPv6** for external connections. When Node.js tries to connect to external services (like Supabase), it attempts IPv6 first by default, resulting in:

```
Failed to log backend event: connect ENETUNREACH 2600:1f18:2e13:9d39:d447:108e:aefc:4ea5:5432
```

This causes:
- Container restarts (failed health checks)
- Database connection failures
- Application instability

## Root Cause
- Supabase DNS returns both IPv4 and IPv6 addresses (A and AAAA records)
- Node.js prefers IPv6 by default when available
- Railway's network cannot route IPv6 traffic to external destinations
- Connection attempts fail with `ENETUNREACH` (Network Unreachable)

## Solution
Force Node.js to use IPv4-only DNS resolution:

```dockerfile
# backend/Dockerfile
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
```

This tells Node.js to:
1. Resolve DNS as usual (get both A and AAAA records)
2. **Prefer IPv4 addresses** when connecting
3. Fall back to IPv6 only if IPv4 fails (won't happen on Railway)

## Alternative Approaches (Not Used)
1. ❌ Custom DNS resolution with `dns.resolve4()` - requires async refactoring
2. ❌ Modify `pg.Pool` config - not supported by node-postgres
3. ❌ Use IP addresses instead of hostnames - breaks SSL certificate validation
4. ✅ **Environment variable** - clean, simple, no code changes

## Verification
After deploying, check logs for:
- ✅ No more `ENETUNREACH` errors
- ✅ `✓ PostgreSQL connection pool initialized`
- ✅ Container stays running without restarts
- ✅ Health checks passing: `"GET /health HTTP/1.1" 200`

## Impact
- **Local Docker**: No change (localhost always uses IPv4)
- **Railway Production**: Forces IPv4 for all external connections
- **Other Platforms**: Should work fine (IPv4 is universally supported)

## Related Files
- `backend/Dockerfile` - Sets the NODE_OPTIONS environment variable
- `backend/server.js` - Database pool initialization (no code changes needed)
- `backend/railway.json` - Railway deployment config

## References
- Node.js DNS options: https://nodejs.org/api/cli.html#--dns-result-orderorder
- Railway IPv6 limitation: Known platform constraint (not publicly documented)
- Related issue: Container restart loop with Supabase connections

---
**Fixed**: November 2, 2025 (Commit 5ad76c8)
