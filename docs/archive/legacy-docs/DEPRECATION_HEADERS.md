# API v1 Deprecation Headers

**Version:** 1.0  
**Last Updated:** December 4, 2025  
**Status:** Active in Production

---

## Overview

As of December 2025, all AiSHA CRM v1 API endpoints that have v2 alternatives now return deprecation headers. This document explains the headers, timeline, and migration path.

## Deprecation Headers

Every v1 API response includes the following headers:

```http
HTTP/1.1 200 OK
X-API-Version: v1
X-API-Deprecation-Date: 2027-02-01
X-API-Sunset-Date: 2027-08-01
X-Migration-Guide: https://docs.aishacrm.com/api/v2/migration
Link: </api/v2/opportunities>; rel="alternate"
Warning: 299 - "API v1 is deprecated. Migrate to v2 by 2027-08-01"
```

### Header Descriptions

| Header | Description |
|--------|-------------|
| `X-API-Version` | Current API version being used (`v1`) |
| `X-API-Deprecation-Date` | Date when v1 officially enters deprecated status |
| `X-API-Sunset-Date` | Date when v1 endpoints will stop working |
| `X-Migration-Guide` | URL to migration documentation |
| `Link` | v2 equivalent endpoint (RFC 5988 format) |
| `Warning` | Human-readable deprecation warning (RFC 7234) |

---

## Implementation Details

### Middleware Location
```
backend/middleware/deprecation.js
```

### Enforcement Logic
The middleware automatically enforces the sunset policy:
- **Before August 1, 2027**: Returns successful responses with deprecation headers
- **After August 1, 2027**: Returns 410 Gone with migration instructions

No manual intervention required - the enforcement activates automatically based on the system date.

### Affected Endpoints

The following v1 endpoint patterns trigger deprecation headers:

| v1 Pattern | v2 Equivalent |
|------------|---------------|
| `/api/opportunities` | `/api/v2/opportunities` |
| `/api/activities` | `/api/v2/activities` |
| `/api/contacts` | `/api/v2/contacts` |
| `/api/accounts` | `/api/v2/accounts` |
| `/api/leads` | `/api/v2/leads` |
| `/api/reports` | `/api/v2/reports` |
| `/api/workflows` | `/api/v2/workflows` |
| `/api/documents` | `/api/v2/documents` |

### Non-Deprecated Endpoints

Endpoints without v2 alternatives do NOT receive deprecation headers:
- `/api/tenants`
- `/api/users`
- `/api/auth`
- `/api/system`
- `/api/integrations`
- And other utility endpoints

---

## Timeline

### Phase 1: Soft Deprecation (December 2025 - January 2027)
- ✅ Deprecation headers added to all v1 responses
- ✅ v2 endpoints available as alternatives
- v1 continues to function normally
- Monitor v1 usage metrics

### Phase 2: Hard Deprecation (February 2027)
- Official deprecation date reached
- Increased warning frequency in logs
- Email notifications to API consumers
- Documentation emphasizes v2

### Phase 3: Sunset (August 2027)
- v1 endpoints return `410 Gone` ✅ **IMPLEMENTED**
- Response body includes migration instructions
- v1 traffic redirected to v2 documentation
- Final warning emails sent

### Implementation Status
**✅ Code Complete**: The 410 enforcement is implemented in `backend/middleware/deprecation.js` and will activate automatically when the current date passes August 1, 2027.

### Post-Sunset Response
```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "status": "error",
  "code": "API_VERSION_SUNSET",
  "message": "API v1 has been retired. Please use API v2.",
  "migrationGuide": "https://docs.aishacrm.com/api/v2/migration",
  "v2Endpoint": "/api/v2/opportunities"
}
```

---

## Client Handling

### Detecting Deprecation

```javascript
// Check for deprecation headers
const response = await fetch('/api/opportunities');
const deprecationDate = response.headers.get('X-API-Deprecation-Date');
const sunsetDate = response.headers.get('X-API-Sunset-Date');

if (deprecationDate) {
  console.warn(`API v1 deprecated. Sunset: ${sunsetDate}`);
  // Log to monitoring system
  // Show user notification (optional)
}
```

### Recommended Client Behavior

1. **Log deprecation warnings** to monitoring system
2. **Track usage metrics** of v1 vs v2 endpoints
3. **Plan migration timeline** based on sunset date
4. **Test v2 endpoints** in staging environment
5. **Gradual rollout** using feature flags

---

## Monitoring

### Backend Logs
Deprecation middleware logs to console:
```
[deprecation] v1 endpoint called: GET /api/opportunities (v2 available: /api/v2/opportunities)
```

### Metrics to Track
- v1 request count by endpoint
- v2 adoption rate over time
- Unique clients still using v1
- Error rates during migration

---

## FAQ

### Q: Will v1 stop working immediately?
**A:** No. v1 continues to work until August 2027. The headers are informational.

### Q: Do I have to migrate to v2?
**A:** Yes, eventually. v1 will return 410 Gone after August 2027.

### Q: What's different in v2?
**A:** v2 includes AI-enhanced responses with predictions, suggestions, and insights. See `API_V2_MIGRATION_GUIDE.md`.

### Q: Can I ignore the deprecation headers?
**A:** You can ignore them temporarily, but you should plan migration before the sunset date.

### Q: What if I need more time?
**A:** Contact support for enterprise migration assistance. Extended support may be available.

---

## Testing

### Unit Tests
Comprehensive tests are located in:
- `backend/__tests__/middleware/deprecation.test.js` - Unit tests for middleware logic
- `backend/__tests__/routes/deprecation.enforcement.test.js` - Integration tests

Run tests with:
```bash
cd backend
node --test __tests__/middleware/deprecation.test.js
```

### Simulating Post-Sunset Behavior
To test the 410 enforcement before the sunset date, the tests use mocked dates. See the "After Sunset Simulation" test suite for examples of how the middleware behaves after August 2027.

---

## Related Documentation

- [API v2 Migration Guide](./API_V2_MIGRATION_GUIDE.md)
- [API Health Monitoring](./API_HEALTH_MONITORING.md)
- [Phase 4 Full Cutover](../orchestra/phases/phase4/PHASE_4_FULL_CUTOVER.md)

---

**Document Owner**: Engineering Team  
**Last Updated**: December 4, 2025
