# Monitoring System

Comprehensive monitoring solution for AiSHA CRM that tracks API routes, traffic, system metrics, and rate limits.

## Features

### 1. API Route Discovery & Documentation Audit
- **Auto-discover all API routes** from Express routers
- **Track Swagger documentation coverage** - identify undocumented endpoints
- **Generate Swagger templates** for undocumented routes
- **Per-file coverage reports**

### 2. Traffic Monitoring
- **Real-time request tracking** - IP, method, path, status, duration
- **Cloudflare metadata extraction** - country, Ray ID, visitor info
- **Bot detection** - identify automated traffic
- **IP statistics** - requests, errors, blocks, avg duration
- **Suspicious activity detection** - high error rates, repeated blocks
- **In-memory buffer** - last 10,000 requests

### 3. System Metrics Collection
- **CPU usage** - percentage, cores, model
- **Memory usage** - total, free, used, process heap
- **Disk usage** - filesystem, size, used, available
- **Network interfaces** - IP addresses, MACs
- **Load average** - 1min, 5min, 15min
- **Uptime** - system and process
- **Health checks** - CPU/memory/disk thresholds
- **Time-series history** - last 1000 samples
- **Aggregated metrics** - avg/min/max over time periods

### 4. Rate Limit Tracking
- **Database persistence** - all violations logged to `rate_limit_violations`
- **IP blocking** - manual and automatic block management
- **Top offenders** - identify IPs with repeated violations
- **Per-endpoint analysis** - which routes are getting hammered
- **Cloudflare integration** - track country, Ray ID
- **Expiring blocks** - temporary bans with auto-cleanup

## Database Schema

```sql
-- Rate limit violations (logged on every 429 response)
rate_limit_violations (
  id UUID PRIMARY KEY,
  ip_address INET,
  tenant_id UUID,
  user_id UUID,
  endpoint TEXT,
  method TEXT,
  limit_type TEXT, -- 'default', 'auth', 'write', 'read', 'refresh'
  user_agent TEXT,
  cloudflare_ray TEXT,
  cloudflare_country TEXT,
  occurred_at TIMESTAMPTZ,
  metadata JSONB
)

-- Blocked IPs (manual or automatic blocking)
blocked_ips (
  id UUID PRIMARY KEY,
  ip_address INET UNIQUE,
  reason TEXT,
  blocked_by TEXT,
  blocked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- NULL for permanent
  is_active BOOLEAN,
  unblocked_at TIMESTAMPTZ
)
```

## API Endpoints

### Overview
```bash
GET /api/monitoring/overview
# Returns: API coverage, system health, rate limits, security stats
```

### API Audit
```bash
GET /api/monitoring/api-audit
# Returns: Total routes, documented, undocumented, coverage %

GET /api/monitoring/api-audit/undocumented
# Returns: List of undocumented routes with Swagger templates
```

### Traffic
```bash
GET /api/monitoring/traffic
# Query: ip, path, statusCode, minDuration, isBot, limit
# Returns: Recent traffic log

GET /api/monitoring/traffic/ip-stats?ip=1.2.3.4
# Returns: Stats for specific IP

GET /api/monitoring/traffic/top-ips?limit=10
# Returns: Top IPs by traffic volume

GET /api/monitoring/traffic/suspicious
# Returns: IPs with high error rates or blocks

POST /api/monitoring/traffic/clear
# Clear traffic log (admin only)
```

### System Metrics
```bash
GET /api/monitoring/system
# Returns: Current CPU, memory, disk, network, load avg

GET /api/monitoring/system/history?limit=100
# Returns: Historical metrics

GET /api/monitoring/system/aggregated?minutes=60
# Returns: Avg/min/max metrics over time period

GET /api/monitoring/system/health
# Returns: Health status with warnings/critical alerts

POST /api/monitoring/system/clear
# Clear metrics history (admin only)
```

### Rate Limits
```bash
GET /api/monitoring/rate-limits?hours=24&limit=100
# Returns: Recent violations

GET /api/monitoring/rate-limits/top-offenders?limit=10&hours=24
# Returns: IPs with most violations

GET /api/monitoring/blocked-ips?activeOnly=true
# Returns: Currently blocked IPs

GET /api/monitoring/blocked-ips/1.2.3.4
# Check if specific IP is blocked

POST /api/monitoring/blocked-ips
# Body: { ip, reason, durationHours }
# Block an IP (admin only)

DELETE /api/monitoring/blocked-ips/1.2.3.4
# Unblock an IP (admin only)

POST /api/monitoring/blocked-ips/cleanup
# Clean up expired blocks
```

## Setup

### 1. Run Database Migration
```bash
npm run db:exec -- backend/migrations/20260424_monitoring_system.sql
```

### 2. Environment Variables
```bash
# System metrics collection (default: enabled)
SYSTEM_METRICS_ENABLED=true

# Health monitoring (default: enabled)
HEALTH_MONITORING_ENABLED=true
```

### 3. Start Server
The monitoring system starts automatically with the backend server:
- Traffic monitoring middleware tracks all requests
- System metrics collection runs every 30 seconds
- Rate limit violations are logged to database automatically

## Usage Examples

### Find Undocumented API Routes
```bash
curl http://localhost:4001/api/monitoring/api-audit | jq '.data.undocumented'
```

### Track Down High-Error IPs
```bash
curl http://localhost:4001/api/monitoring/traffic/suspicious
```

### Monitor System Health
```bash
curl http://localhost:4001/api/monitoring/system/health
```

### Block Abusive IP
```bash
curl -X POST http://localhost:4001/api/monitoring/blocked-ips \
  -H "Content-Type: application/json" \
  -d '{"ip": "1.2.3.4", "reason": "Brute force attack", "durationHours": 24}'
```

### View Rate Limit Violations
```bash
curl "http://localhost:4001/api/monitoring/rate-limits?hours=1" | jq '.data.violations'
```

## Diagnosing Cloudflare Blocks

When Cloudflare blocks your server's IP, check:

### 1. Outbound Request Patterns
```bash
# Get suspicious IPs hitting your API
curl http://localhost:4001/api/monitoring/traffic/suspicious
```

### 2. Rate Limit Violations
```bash
# Check which endpoints are getting hammered
curl http://localhost:4001/api/monitoring/rate-limits/top-offenders
```

### 3. System Resource Usage
```bash
# Check if CPU is pegged (might trigger rate limits)
curl http://localhost:4001/api/monitoring/system/health
```

### 4. Traffic Analysis
```bash
# Look for bot traffic
curl "http://localhost:4001/api/monitoring/traffic?isBot=true&limit=100"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Application                       │
├─────────────────────────────────────────────────────────────┤
│  Traffic Monitor Middleware                                  │
│  - Captures all requests                                     │
│  - Extracts IP, headers, Cloudflare metadata                 │
│  - Tracks duration, status                                   │
│  - Detects bots                                              │
│  - Updates in-memory stats                                   │
├─────────────────────────────────────────────────────────────┤
│  Rate Limiter Middleware                                     │
│  - express-rate-limit (in-memory)                            │
│  - On 429: logs to database via rateLimitTracker             │
│  - Tracks limit type (default/auth/write/read/refresh)       │
├─────────────────────────────────────────────────────────────┤
│  API Routes                                                  │
│  - /api/monitoring/* (new monitoring dashboard)              │
│  - /api/* (existing routes)                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Background Services                             │
├─────────────────────────────────────────────────────────────┤
│  System Metrics Collector                                    │
│  - Runs every 30 seconds                                     │
│  - Collects CPU, memory, disk, network                       │
│  - Stores in-memory history (1000 samples)                   │
│  - Detects resource exhaustion                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Database (Supabase)                        │
├─────────────────────────────────────────────────────────────┤
│  rate_limit_violations (persistent log)                      │
│  blocked_ips (IP block management)                           │
└─────────────────────────────────────────────────────────────┘
```

## Files

- `backend/lib/apiAuditor.js` - Route discovery and Swagger audit
- `backend/middleware/trafficMonitor.js` - Traffic tracking middleware
- `backend/lib/systemMetrics.js` - CPU/memory/disk metrics collector
- `backend/lib/rateLimitTracker.js` - Rate limit DB persistence
- `backend/routes/monitoring.js` - Monitoring dashboard API
- `backend/migrations/20260424_monitoring_system.sql` - Database schema

## Security Notes

- **Admin only**: Most monitoring endpoints require authentication
- **No secrets logged**: Authorization headers and API keys are excluded
- **IP privacy**: Can be configured to hash IPs for GDPR compliance
- **RLS policies**: Database tables use service role only (not tenant-scoped)

## Performance Impact

- **Traffic monitoring**: ~1-2ms overhead per request (negligible)
- **System metrics**: 30s interval, <10ms per collection
- **Rate limit logging**: Async, doesn't block request handling
- **Memory**: ~5MB for traffic buffer (10k requests) + ~1MB for metrics (1000 samples)

## Troubleshooting

### No traffic data
- Check traffic monitor middleware is mounted: `grep trafficMonitor backend/server.js`
- Restart backend: `docker compose restart backend`

### Rate limit violations not logged
- Check migration was run: `psql -c "\d rate_limit_violations"`
- Check Supabase connection: `curl http://localhost:4001/api/system/status`

### System metrics not collecting
- Check environment: `SYSTEM_METRICS_ENABLED=true`
- Check logs: `docker compose logs backend | grep SystemMetrics`

### Swagger still not loading
- Check CSP headers in [backend/server.js](../server.js) - Swagger UI requires script-src and style-src
- Check browser console for CSP violations
- Try accessing Swagger JSON directly: `curl http://localhost:4001/api-docs.json`
