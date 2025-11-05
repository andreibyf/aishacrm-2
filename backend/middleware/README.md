# Backend Middleware

This directory contains Express middleware utilities for the Aisha CRM backend.

## Available Middleware

### 🔒 Security & Access Control

#### `validateTenant.js`
Enforces tenant-scoping for all non-superadmin users:
- **validateTenantAccess**: Ensures users only access their assigned tenant data
- **requireAdminRole**: Restricts routes to superadmin/admin only
- **enforceEmployeeDataScope**: Limits employees to their own data

```javascript
import { validateTenantAccess, requireAdminRole } from '../middleware/validateTenant.js';

router.use(validateTenantAccess);  // Apply to all routes
router.post('/settings', requireAdminRole, handler);  // Admin-only routes
```

#### `productionSafetyGuard.js` ⚠️
**CRITICAL**: Prevents write operations (POST/PUT/PATCH/DELETE) against production/cloud databases unless explicitly allowed.

**Detects production via**:
- Supabase Cloud URLs (`.supabase.co`, `db.supabase.io`)
- Render.com platform indicators
- `NODE_ENV=production` + non-localhost DB

**Override mechanisms**:
1. `ALLOW_PRODUCTION_WRITES=true` (environment variable)
2. `X-Allow-Production-Write: <token>` header (requires `PRODUCTION_WRITE_TOKEN` env)
3. E2E test mode: `E2E_TEST_MODE=true` AND `ALLOW_E2E_MUTATIONS=true`

```javascript
import { productionSafetyGuard } from '../middleware/productionSafetyGuard.js';

// Apply globally in server.js (recommended):
app.use(productionSafetyGuard());

// Or per-route:
router.post('/dangerous-operation', productionSafetyGuard(), handler);

// Disable for specific routes:
router.post('/webhook', productionSafetyGuard({ enabled: false }), handler);
```

**When guard blocks a request**:
```json
{
  "status": "error",
  "message": "Write operations are disabled on production database",
  "code": "PRODUCTION_SAFETY_GUARD",
  "details": {
    "method": "POST",
    "path": "/api/users",
    "hint": "To enable writes, set ALLOW_PRODUCTION_WRITES=true or provide X-Allow-Production-Write header",
    "database": "production/cloud"
  }
}
```

### 🎯 Query & Data Scoping

#### `tenantScopedId.js`
Centralizes GET-by-id tenant scoping logic. When `tenant_id` is provided in the query string, ensures the record matches both `id` AND `tenant_id`.

```javascript
import { tenantScopedId, buildGetByIdSQL } from '../middleware/tenantScopedId.js';

// Apply middleware
router.get('/:id', tenantScopedId(), async (req, res) => {
  // req.idScope contains { id, tenant_id, where, params }
  const { text, params } = buildGetByIdSQL('accounts', req.idScope);
  const result = await pgPool.query(text, params);
  // ... handle result
});
```

**Without tenant_id**:
- Query: `GET /api/accounts/123`
- SQL: `SELECT * FROM accounts WHERE id = $1` → `[123]`

**With tenant_id**:
- Query: `GET /api/accounts/123?tenant_id=tenant-abc`
- SQL: `SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2` → `[123, 'tenant-abc']`

### 📊 Monitoring & Performance

#### `performanceLogger.js`
Tracks API endpoint performance metrics (response times, status codes, errors) and stores them in the database for analytics.

```javascript
import { performanceLogger } from './middleware/performanceLogger.js';

if (pgPool) {
  app.use(performanceLogger(pgPool));
}
```

---

## Middleware Order (Recommended)

Apply middleware in this order in `server.js`:

```javascript
// 1. Security headers
app.use(helmet());

// 2. Compression & logging
app.use(compression());
app.use(morgan('combined'));

// 3. Rate limiting
app.use('/api', rateLimiter);

// 4. CORS
app.use(cors({ ... }));

// 5. Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 6. Performance monitoring
app.use(performanceLogger(pgPool));

// 7. 🔒 PRODUCTION SAFETY GUARD (CRITICAL)
app.use(productionSafetyGuard());

// 8. Routes with tenant validation
app.use('/api/accounts', validateTenantAccess, accountRoutes);
app.use('/api/leads', validateTenantAccess, leadRoutes);
// etc.
```

---

## Environment Variables

### Production Safety Guard
- `ALLOW_PRODUCTION_WRITES` - Set to `true` to disable guard globally (⚠️ not recommended)
- `PRODUCTION_WRITE_TOKEN` - Secret token for header-based bypass
- `E2E_TEST_MODE` - Enable E2E test mode (requires `ALLOW_E2E_MUTATIONS=true`)
- `ALLOW_E2E_MUTATIONS` - Allow E2E tests to mutate production data (⚠️ dangerous)

### Rate Limiting
- `RATE_LIMIT_WINDOW_MS` - Time window in milliseconds (default: 60000)
- `RATE_LIMIT_MAX` - Max requests per window (default: 120)

---

## Migration Notes

### `productionWriteGuard.js` → `productionSafetyGuard.js`
The old `productionWriteGuard.js` has been replaced by `productionSafetyGuard.js` with improved:
- Auto-detection of production databases (Supabase Cloud, Render.com, etc.)
- More flexible override mechanisms
- Better error messages with actionable hints
- Consistent naming with other middleware

**Breaking changes**: None if using default exports. If you imported specific functions, update:
```javascript
// Old:
import { productionWriteGuard } from './middleware/productionWriteGuard.js';

// New:
import { productionSafetyGuard } from './middleware/productionSafetyGuard.js';
```

---

## Testing

### Bypass Guards in Tests
```javascript
// E2E tests: Set environment variables
process.env.E2E_TEST_MODE = 'true';
process.env.ALLOW_E2E_MUTATIONS = 'true';

// Or use header:
await fetch('/api/users', {
  method: 'POST',
  headers: {
    'X-Allow-Production-Write': process.env.PRODUCTION_WRITE_TOKEN
  },
  body: JSON.stringify(data)
});
```

### Unit Test Middleware
```javascript
import { tenantScopedId } from '../middleware/tenantScopedId.js';

test('tenantScopedId attaches idScope to request', () => {
  const req = { params: { id: '123' }, query: { tenant_id: 'abc' } };
  const res = {};
  const next = jest.fn();
  
  tenantScopedId()(req, res, next);
  
  expect(req.idScope).toEqual({
    id: '123',
    tenant_id: 'abc',
    where: 'id = $1 AND tenant_id = $2',
    params: ['123', 'abc']
  });
  expect(next).toHaveBeenCalled();
});
```

---

## Best Practices

1. **Always apply `productionSafetyGuard()` early** in the middleware chain (after body parsing, before routes)
2. **Use `validateTenantAccess`** on all tenant-scoped entity routes
3. **Combine `tenantScopedId` with `validateTenantAccess`** for GET-by-id endpoints
4. **Apply `requireAdminRole`** to settings/configuration routes
5. **Never commit production write tokens** to version control
6. **Test with guards enabled** - don't disable in E2E config files; use runtime overrides
7. **Monitor `performanceLogger` output** for slow endpoints and errors

---

For questions or issues, see `docs/DEVELOPER_GUIDE.md` or contact the team.
