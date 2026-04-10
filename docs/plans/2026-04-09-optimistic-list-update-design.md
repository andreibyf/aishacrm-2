# Optimistic List Update — Contacts, Accounts, Opportunities

**Date:** 2026-04-09  
**Status:** Approved

## Problem

After saving a record edit, the list page shows stale data until `runMutationRefresh` completes (3 retry passes, ~400–500ms). Users see the old row values briefly after the form closes.

## Root Cause

Leads.jsx already has an **optimistic UI update**: immediately after save, it patches the row in local React state using the result the form returns, then fires `runMutationRefresh` in the background. The list shows correct values instantly.

Contacts, Accounts, and Opportunities do the same `runMutationRefresh` call but skip the optimistic patch — even though their forms already return the full updated record.

This is a **frontend-only issue**. Redis cache invalidation (`invalidateCache` middleware) is working correctly on all mutation routes.

## Design

Add the optimistic patch before `runMutationRefresh` in each page's save handler. Only apply on edits (not creates), guarded by `result?.id` or `!wasCreating`.

### Contacts.jsx — `handleUpdate` (line 192)

`result` is already the first parameter. `employeeMap` is in scope (line 111) as a `Map<id, {first_name, last_name}>`.

```js
if (result?.id) {
  const emp = employeeMap.get(result.assigned_to);
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : null;
  setContacts((prev) =>
    prev.map((c) =>
      c.id === result.id
        ? {
            ...c,
            ...result,
            assigned_to_name: empName || result.assigned_to_name || c.assigned_to_name,
          }
        : c,
    ),
  );
}
```

### Accounts.jsx — `handleSave` (lines 153, ~354)

Two sub-changes:

1. Change signature from `async ()` → `async (result = null)`
2. Change form `onSubmit` from `async (_result) => { await handleSave() }` → `async (result) => { await handleSave(result) }`
3. Add optimistic patch (no employee map available):

```js
if (wasEditing && editingId && result) {
  setAccounts((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...result } : a)));
}
```

### Opportunities.jsx — `handleSave` (lines 170, ~385)

Two sub-changes:

1. Change signature from `async ()` → `async (result = null)`
2. Change form `onSubmit` from `async (result) => { ...; await handleSave() }` → `async (result) => { ...; await handleSave(result) }`
3. Add optimistic patch (`employeesMap` and `usersMap` are string maps in scope at lines 112–113):

```js
if (!wasCreating && editingId && result) {
  const empName = employeesMap[result.assigned_to] || usersMap[result.assigned_to] || null;
  setOpportunities((prev) =>
    prev.map((o) =>
      o.id === editingId
        ? {
            ...o,
            ...result,
            assigned_to_name: empName || result.assigned_to_name || o.assigned_to_name,
          }
        : o,
    ),
  );
}
```

## Files Changed

| File                          | Lines      | Change                                 |
| ----------------------------- | ---------- | -------------------------------------- |
| `src/pages/Contacts.jsx`      | ~192       | Add optimistic patch in `handleUpdate` |
| `src/pages/Accounts.jsx`      | ~153, ~354 | Add result param + optimistic patch    |
| `src/pages/Opportunities.jsx` | ~170, ~385 | Add result param + optimistic patch    |

## No Backend Changes

Redis invalidation is already correct. This fix is purely frontend state management.
