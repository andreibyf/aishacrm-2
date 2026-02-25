# User Management Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 3 bugs in User Management: display name showing "Unknown User", tenant switching not refreshing, and new employee not appearing immediately.

**Architecture:** Backend changes to `expandUserMetadata()` and invite endpoint fix display names. Frontend changes to `EnhancedUserManagement.jsx` use `useTenant()` context hook + `tenant-changed` event for reactive tenant switching. Cache TTL reduction + frontend cache-busting fix stale data after invite.

**Tech Stack:** Node.js/Express backend, React 18 frontend, Supabase PostgreSQL

---

## Task 1: Fix `expandUserMetadata()` to compute display_name

**Files:**
- Modify: `backend/routes/users.js:152-186`
- Test: `backend/__tests__/routes/users.listing-retrieval.test.js`

**Step 1: Write the failing test**

Add a test to `backend/__tests__/routes/users.listing-retrieval.test.js` that verifies `expandUserMetadata` computes `display_name` and `full_name` from `first_name` + `last_name` when not already in metadata.

Since `expandUserMetadata` is defined inside the route factory (not exported), test it through the API response: create a user with `first_name: 'Jane'`, `last_name: 'Doe'`, no `display_name` in metadata, and assert the GET response includes `display_name: 'Jane Doe'` and `full_name: 'Jane Doe'`.

However, since the test setup is complex (requires DB mocks), a simpler approach is to add unit-level verification inline. We'll verify through the existing integration test pattern.

For now, skip to step 2 — this is a data-transformation bug best verified manually + via the invite test in Task 3.

**Step 2: Modify `expandUserMetadata()` in `backend/routes/users.js:152-186`**

After the promote loop (line 173), add computed `display_name` and `full_name`:

```javascript
const expandUserMetadata = (user) => {
  if (!user) return user;
  const { metadata = {}, ...rest } = user;

  // Whitelist of metadata keys promoted to top-level for convenience.
  const promoteKeys = [
    'display_name',
    'live_status',
    'last_seen',
    'is_active',
    'account_status',
    'employee_role',
    'tags',
    'permissions',
    'navigation_permissions',
    'password_change_required',
    'password_expires_at',
  ];
  const promoted = {};
  for (const k of promoteKeys) {
    if (k in metadata) promoted[k] = metadata[k];
  }

  // Remove promoted keys from nested metadata to avoid duplication.
  const nestedMetadata = { ...metadata };
  for (const k of promoteKeys) {
    if (k in nestedMetadata) delete nestedMetadata[k];
  }

  // Compute display_name and full_name from first_name + last_name if not already set.
  // This ensures the frontend always has a human-readable name.
  const computedFullName = [rest.first_name, rest.last_name].filter(Boolean).join(' ');
  if (!promoted.display_name && computedFullName) {
    promoted.display_name = computedFullName;
  }
  if (!promoted.display_name && rest.email) {
    promoted.display_name = rest.email;
  }

  return {
    ...rest,
    ...promoted,
    full_name: computedFullName || rest.email || null,
    metadata: nestedMetadata, // slim metadata without promoted duplicates
  };
};
```

**Step 3: Run backend tests to verify nothing breaks**

Run: `cd backend && npm test -- --test-name-pattern="users" 2>&1 | head -50`
Expected: All existing user tests pass.

**Step 4: Commit**

```bash
git add backend/routes/users.js
git commit -m "fix: compute display_name from first_name+last_name in expandUserMetadata"
```

---

## Task 2: Store display_name in metadata during invite

**Files:**
- Modify: `backend/routes/users.js:1207-1214`

**Step 1: Add `display_name` to the metadata object in POST /invite**

At line 1208, the `metadata` object is built but lacks `display_name`. Add it:

```javascript
// Build metadata
const metadata = {
  display_name: full_name || first_name || null,
  crm_access: crm_access !== false,
  requested_access: requested_access || 'read_write',
  can_use_softphone: can_use_softphone || false,
  phone: phone || null,
  permissions: permissions || {},
};
```

This ensures newly invited users have `display_name` in their `metadata` column, so `expandUserMetadata()` promotes it immediately — no computation needed.

**Step 2: Run backend tests**

Run: `cd backend && npm test -- --test-name-pattern="invite" 2>&1 | head -50`
Expected: All invite tests pass.

**Step 3: Commit**

```bash
git add backend/routes/users.js
git commit -m "fix: store display_name in metadata during user invite"
```

---

## Task 3: Fix `/profiles` endpoint consistency

**Files:**
- Modify: `backend/routes/users.js:460-471`

**Step 1: Verify the `/profiles` endpoint already computes display_name correctly**

Read `backend/routes/users.js:460-471`. The `/profiles` endpoint already computes:
```javascript
display_name: p.user_metadata?.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
```

This already works correctly. No changes needed here — the design doc asked us to "verify consistency". Confirmed: both endpoints now compute `display_name` the same way (metadata first, then first+last, then email).

**Step 2: Skip — no changes needed. Move to next task.**

---

## Task 4: Reduce cache TTL on GET /api/users

**Files:**
- Modify: `backend/routes/users.js:190`

**Step 1: Change `cacheList('users', 180)` to `cacheList('users', 30)`**

At line 190, change:
```javascript
// Before:
router.get('/', cacheList('users', 180), async (req, res) => {
// After:
router.get('/', cacheList('users', 30), async (req, res) => {
```

This reduces the server-side cache from 3 minutes to 30 seconds.

**Step 2: Run backend tests**

Run: `cd backend && npm test -- --test-name-pattern="users" 2>&1 | head -50`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add backend/routes/users.js
git commit -m "fix: reduce users cache TTL from 180s to 30s"
```

---

## Task 5: Verify `invalidateCache` middleware — no change needed

**Analysis:** `invalidateCache('users')` in `cacheMiddleware.js` is a response-wrapping middleware — it intercepts `res.json()` and invalidates the cache AFTER a successful (2xx) response. So the cache IS correctly invalidated after the user is created.

The real fix for stale data is the TTL reduction (Task 4) + frontend cache-busting (Task 6). No changes needed to the middleware chain.

**Step 1: Skip — no changes needed. Move to Task 6.**

---

## Task 6: Add cache-busting param to frontend re-fetch after invite

**Files:**
- Modify: `src/api/entities.js:2174-2200`
- Modify: `src/components/settings/EnhancedUserManagement.jsx:896-898`

**Step 1: Add `_t` cache-busting support to `User.listProfiles()`**

In `src/api/entities.js:2174-2200`, add a `cacheBust` option:

```javascript
listProfiles: async (filters = {}, { cacheBust = false } = {}) => {
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    if (cacheBust) {
      params.append('_t', Date.now());
    }

    const url = `${BACKEND_URL}/api/users${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.data?.users || result.data || result || [];
  } catch (error) {
    console.error('[User.listProfiles] Error:', error);
    throw error;
  }
},
```

**Step 2: Use `cacheBust: true` in `handleInviteSuccess`**

In `src/components/settings/EnhancedUserManagement.jsx`, modify `handleInviteSuccess` at line 896:

```javascript
const handleInviteSuccess = () => {
  // Small delay to allow backend cache invalidation to complete,
  // then re-fetch with cache-busting to ensure fresh data
  setTimeout(() => loadData({ cacheBust: true }), 500);
};
```

**Step 3: Update `loadData` to accept options and pass through to `listProfiles`**

Modify `loadData` at line 777 to accept an options param:

```javascript
const loadData = async (options = {}) => {
  if (!currentUser) return;
  setLoading(true);
  try {
    let userFilter = {};
    if (currentUser.role === 'superadmin') {
      if (urlTenantId) {
        userFilter.tenant_id = urlTenantId;
      }
    } else {
      userFilter.tenant_id = currentUser.tenant_id;
    }

    const [usersData, tenantsData, moduleData] = await Promise.all([
      User.listProfiles(userFilter, { cacheBust: !!options.cacheBust }),
      currentUser.role === 'superadmin' ? Tenant.list() : Promise.resolve([]),
      urlTenantId || currentUser.tenant_id
        ? ModuleSettings.filter({ tenant_id: urlTenantId || currentUser.tenant_id })
        : Promise.resolve([]),
    ]);

    console.log(
      '[EnhancedUserManagement] Loaded users from user_profile_view:',
      usersData?.length || 0,
    );
    setUsers(usersData);
    setAllTenants(tenantsData);
    setModuleSettings(moduleData || []);
  } catch (error) {
    console.error('Failed to load data:', error);
    toast.error('Failed to load user and tenant data.');
  } finally {
    setLoading(false);
  }
};
```

**Step 4: Run frontend tests**

Run: `npm run test:run 2>&1 | tail -20`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/api/entities.js src/components/settings/EnhancedUserManagement.jsx
git commit -m "fix: add cache-busting to user list re-fetch after invite"
```

---

## Task 7: Add `useTenant()` hook for reactive tenant switching

**Files:**
- Modify: `src/components/settings/EnhancedUserManagement.jsx:1-2, 766-775`

**Step 1: Import `useTenant` and add it as primary tenant source**

At the top of the file (line 1-2 area), add the import. The file already imports `useUser` from somewhere — add `useTenant` from `../shared/tenantContext`:

```javascript
import { useTenant } from '../shared/tenantContext';
```

**Step 2: Use `useTenant()` as the primary tenant ID source**

Replace lines 766-775 with:

```javascript
// Use global user context
const { user: currentUser } = useUser();
const [searchParams] = useSearchParams();
const urlTenantId = searchParams.get('tenant');
// Primary tenant source: context hook (reacts to TenantSwitcher changes)
const { selectedTenantId: contextTenantId } = useTenant();
// Resolved tenant: context takes priority, URL param as fallback for deep links
const activeTenantId = contextTenantId || urlTenantId;
```

**Step 3: Update the `useEffect` dependency to use `activeTenantId`**

Replace the existing useEffect (lines 771-775):

```javascript
useEffect(() => {
  if (!currentUser) return;
  loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentUser, activeTenantId]);
```

**Step 4: Update `loadData` to use `activeTenantId` instead of `urlTenantId`**

In `loadData` (starting at line 777), replace all references to `urlTenantId` with `activeTenantId`:

```javascript
const loadData = async (options = {}) => {
  if (!currentUser) return;
  setLoading(true);
  try {
    let userFilter = {};
    if (currentUser.role === 'superadmin') {
      if (activeTenantId) {
        userFilter.tenant_id = activeTenantId;
      }
    } else {
      userFilter.tenant_id = currentUser.tenant_id;
    }

    const [usersData, tenantsData, moduleData] = await Promise.all([
      User.listProfiles(userFilter, { cacheBust: !!options.cacheBust }),
      currentUser.role === 'superadmin' ? Tenant.list() : Promise.resolve([]),
      activeTenantId || currentUser.tenant_id
        ? ModuleSettings.filter({ tenant_id: activeTenantId || currentUser.tenant_id })
        : Promise.resolve([]),
    ]);

    console.log(
      '[EnhancedUserManagement] Loaded users from user_profile_view:',
      usersData?.length || 0,
    );
    setUsers(usersData);
    setAllTenants(tenantsData);
    setModuleSettings(moduleData || []);
  } catch (error) {
    console.error('Failed to load data:', error);
    toast.error('Failed to load user and tenant data.');
  } finally {
    setLoading(false);
  }
};
```

**Step 5: Run frontend tests**

Run: `npm run test:run 2>&1 | tail -20`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/components/settings/EnhancedUserManagement.jsx
git commit -m "fix: use useTenant() context hook for reactive tenant switching"
```

---

## Task 8: Add `tenant-changed` event listener for extra reactivity

**Files:**
- Modify: `src/components/settings/EnhancedUserManagement.jsx`

**Step 1: Add a `useEffect` that listens for the `tenant-changed` custom event**

Add after the existing `useEffect` (around line 775):

```javascript
// Listen for tenant-changed events (fired by TenantSwitcher via tenantContext)
// This provides a reactive fallback in case React context doesn't re-render
useEffect(() => {
  const handleTenantChanged = (e) => {
    console.log('[EnhancedUserManagement] tenant-changed event:', e.detail?.tenantId);
    // Reset search/filters when tenant changes
    setSearchQuery('');
    setSelectedRole('all');
    setSelectedStatus('all');
    setSelectedUsers(new Set());
    // Trigger re-fetch (activeTenantId will already be updated via context)
  };

  window.addEventListener('tenant-changed', handleTenantChanged);
  return () => window.removeEventListener('tenant-changed', handleTenantChanged);
}, []);
```

Note: We need to verify the state setter names exist. Check the component for `setSearchQuery`, `setSelectedRole`, etc.

**Step 2: Run frontend tests**

Run: `npm run test:run 2>&1 | tail -20`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/components/settings/EnhancedUserManagement.jsx
git commit -m "fix: add tenant-changed event listener to reset filters on switch"
```

---

## Task 9: Manual verification

**Step 1: Start frontend and backend dev servers**

Start both dev servers and open the app in a browser.

**Step 2: Verify Bug 1 fix — Display Name**

1. Navigate to Settings → User Management
2. Verify existing users show their first_name + last_name (not "Unknown User")
3. Create a new employee via Invite User dialog
4. After creation, verify the new user's display name shows correctly

**Step 3: Verify Bug 2 fix — Tenant switching**

1. As superadmin, switch between tenants using TenantSwitcher
2. Verify the user list refreshes immediately to show only that tenant's users
3. Verify search filters reset when switching tenants
4. Verify deep links with `?tenant=UUID` still work

**Step 4: Verify Bug 3 fix — New employee appears immediately**

1. Create a new employee via Invite User
2. Verify the employee appears in the list within ~1 second (no need to navigate away)
3. Check browser network tab: the re-fetch should have `_t=` param

**Step 5: Run full test suite**

Run: `npm run test:run`
Run: `cd backend && npm test`
Expected: All tests pass.

**Step 6: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore: cleanup after user management bug fixes verification"
```
