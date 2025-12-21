# Test Suite Modernization - Pre-Launch Priority

## Status: 📋 Planned

## Overview

Migrate backend tests from legacy `/api/*` endpoints to `/api/v2/*` AI-enhanced routes.

## Current State

| Test File | Current Route | Target Route | Priority |
|-----------|---------------|--------------|----------|
| `activities.filters.test.js` | `/api/activities` | `/api/v2/activities` | High |
| `activities.route.test.js` | Mixed | `/api/v2/activities` | High |
| `leads.route.test.js` | `/api/leads` | `/api/v2/leads` | High |
| `accounts.route.test.js` | `/api/accounts` | `/api/v2/accounts` | Medium |
| `contacts.route.test.js` | `/api/contacts` | `/api/v2/contacts` | Medium |
| `opportunities.route.test.js` | `/api/opportunities` | `/api/v2/opportunities` | Medium |

## Key Issues to Fix

### 1. Invalid `assigned_to` Format
```javascript
// ❌ Old test (uses string username)
await createActivity({ assigned_to: 'alice', ... })

// ✅ Fix (use UUID or test employee ID)
const TEST_EMPLOYEE_ID = process.env.TEST_EMPLOYEE_ID || '<seeded-employee-uuid>';
await createActivity({ assigned_to: TEST_EMPLOYEE_ID, ... })
```

### 2. Use v2 Endpoints
```javascript
// ❌ Old
const res = await fetch(`${BASE_URL}/api/activities`, {...})

// ✅ New
const res = await fetch(`${BASE_URL}/api/v2/activities`, {...})
```

### 3. Handle v2 Response Format
```javascript
// v2 returns { status: 'success', data: { activities: [...] } }
const json = await res.json();
const activities = json.data?.activities || json.data || [];
```

### 4. Test Data Seeding
- Create test fixtures for employees, tenants
- Use `is_test_data: true` flag for cleanup
- Consider beforeAll/afterAll test data setup

## Migration Checklist

- [ ] Create test data seeding script (`__tests__/setup/seedTestData.js`)
- [ ] Migrate `activities.filters.test.js` to v2
- [ ] Migrate `activities.route.test.js` to v2
- [ ] Migrate `leads.route.test.js` to v2
- [ ] Update AI suggestion tests with seeded data
- [ ] Add v2-specific filter tests (AI context enrichment, etc.)
- [ ] Remove deprecated v1 test files or mark as legacy

## v2 Route Enhancements to Test

1. **AI Context Enrichment** - Each record should include `aiContext`
2. **Employee Resolution** - `assigned_to` FK joins to employee name
3. **Metadata Expansion** - Nested metadata flattened to top-level
4. **Pagination** - `limit`, `offset`, `total` counts
5. **Filter Support** - Complex filters via query params

## Timeline

| Phase | Task | Target |
|-------|------|--------|
| 1 | Create test data seeding | Pre-launch |
| 2 | Migrate activities tests | Pre-launch |
| 3 | Migrate other entity tests | Post-launch Sprint 1 |
| 4 | Remove legacy v1 tests | Post-launch Sprint 2 |

---

Created: 2025-12-20
Priority: Pre-Launch
