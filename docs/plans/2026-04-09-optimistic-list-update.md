# Optimistic List Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After saving a record edit, the list row immediately shows fresh data instead of waiting for `runMutationRefresh` to complete.

**Architecture:** Each page's save handler already receives the full updated record from the form. We spread that result into the matching list row in local React state before firing the background reload — identical to how `Leads.jsx` already works. No backend changes needed; Redis invalidation is already correct.

**Tech Stack:** React 18, Vite, local component state (`useState`)

**Design doc:** `docs/plans/2026-04-09-optimistic-list-update-design.md`

---

## Prerequisite reading (2 min)

Before touching any file, read `src/pages/Leads.jsx` lines 283–332 (`handleSave`). That is the reference implementation. Every change in this plan produces the same pattern.

---

### Task 1: Contacts.jsx — optimistic patch in `handleUpdate`

**Files:**

- Modify: `src/pages/Contacts.jsx:192–209`

`handleUpdate` already receives `result` as its first argument and `employeeMap` is already in scope (line 111) as a `Map<uuid, {first_name, last_name, ...}>`.

**Step 1: Read the current handler**

Open `src/pages/Contacts.jsx` and read lines 192–209 to confirm the current shape before editing.

**Step 2: Add the optimistic patch**

Insert the following block immediately after line 192 (`const handleUpdate = async (result) => {`), before `if (result?.id) setUpdatingId(result.id)`:

```js
// Optimistic update: patch the contact in-place so the list shows new data instantly
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

The resulting handler should look like:

```js
const handleUpdate = async (result) => {
  // Optimistic update: patch the contact in-place so the list shows new data instantly
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
  if (result?.id) setUpdatingId(result.id);
  try {
    logger.info('Contact updated by form', 'ContactsPage', {
      contactId: result?.id,
      contactName: `${result?.first_name} ${result?.last_name}`,
    });
    setIsFormOpen(false);
    setEditingContact(null);
    clearCacheByKey('Contact');
    await runMutationRefresh(
      () => Promise.all([loadContacts(), loadTotalStats(), refreshAccounts()]),
      { passes: 3, initialDelayMs: 80, stepDelayMs: 160 },
    );
  } finally {
    setUpdatingId(null);
  }
};
```

**Step 3: Verify manually**

1. Open the Contacts list page in the browser
2. Edit any contact — change the first name or assigned employee
3. Save the form
4. Confirm the list row updates **immediately** when the form closes, before the background reload spinner clears

**Step 4: Commit**

```bash
git add src/pages/Contacts.jsx
git commit -m "feat(contacts): optimistic list update after record edit"
```

---

### Task 2: Accounts.jsx — wire result through + optimistic patch

**Files:**

- Modify: `src/pages/Accounts.jsx:153` (handler signature)
- Modify: `src/pages/Accounts.jsx:~354` (form onSubmit — pass result through)

`handleSave` currently ignores any return value. The form's `onSubmit` prop drops the result with `async (_result) => { await handleSave() }`. Fix both ends.

**Step 1: Read the current code**

Read `src/pages/Accounts.jsx` lines 150–180 (handler) and lines 340–370 (form JSX with `onSubmit`) to confirm current shape.

**Step 2: Change the handler signature and add the optimistic patch**

At line 153, change:

```js
const handleSave = async () => {
```

to:

```js
const handleSave = async (result = null) => {
```

Then insert the optimistic patch immediately after the `setEditingAccount(null)` line (currently line 159), before the `if (wasEditing && editingId) setUpdatingId(editingId)` line:

```js
// Optimistic update: patch the account in-place so the list shows new data instantly
if (wasEditing && editingId && result) {
  setAccounts((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...result } : a)));
}
```

The resulting handler should look like:

```js
const handleSave = async (result = null) => {
  const wasEditing = !!editingAccount;
  const editingId = editingAccount?.id || null;

  // Close form immediately — don't make user wait for background reload
  setIsFormOpen(false);
  setEditingAccount(null);

  // Optimistic update: patch the account in-place so the list shows new data instantly
  if (wasEditing && editingId && result) {
    setAccounts((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...result } : a)));
  }

  if (wasEditing && editingId) setUpdatingId(editingId);
  try {
    clearCacheByKey('Account');
    await runMutationRefresh(() => Promise.all([loadAccounts(), loadTotalStats()]), {
      passes: 3,
      initialDelayMs: 80,
      stepDelayMs: 160,
    });
    toast.success(wasEditing ? 'Account updated successfully' : 'Account created successfully');
  } catch (error) {
    console.error('[Accounts] Error in handleSave:', error);
    toast.error('Failed to refresh account list');
  } finally {
    setUpdatingId(null);
  }
};
```

**Step 3: Pass result through the form's onSubmit**

Find the form JSX near line 354 where `onSubmit` currently reads:

```js
onSubmit={async (_result) => {
  await handleSave();
}}
```

Change to:

```js
onSubmit={async (result) => {
  await handleSave(result);
}}
```

**Step 4: Verify manually**

1. Open the Accounts list page
2. Edit any account — change the account name or type
3. Save the form
4. Confirm the row updates immediately when the form closes

**Step 5: Commit**

```bash
git add src/pages/Accounts.jsx
git commit -m "feat(accounts): optimistic list update after record edit"
```

---

### Task 3: Opportunities.jsx — wire result through + optimistic patch

**Files:**

- Modify: `src/pages/Opportunities.jsx:170` (handler signature)
- Modify: `src/pages/Opportunities.jsx:~385` (form onSubmit — pass result through)

Same pattern as Accounts, but with employee name resolution since `employeesMap` and `usersMap` are both in scope (lines 112–113) as plain objects where `map[uuid]` returns the display name string directly.

**Step 1: Read the current code**

Read `src/pages/Opportunities.jsx` lines 167–200 (handler) and lines 375–395 (form JSX with `onSubmit`).

**Step 2: Change the handler signature and add the optimistic patch**

At line 170, change:

```js
const handleSave = async () => {
```

to:

```js
const handleSave = async (result = null) => {
```

Insert the optimistic patch immediately after `setEditingOpportunity(null)` (currently line 176), before `if (!wasCreating && editingId) setUpdatingId(editingId)`:

```js
// Optimistic update: patch the opportunity in-place so the list shows new data instantly
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

The resulting handler should look like:

```js
const handleSave = async (result = null) => {
  const wasCreating = !editingOpportunity;
  const editingId = editingOpportunity?.id || null;

  // Close form immediately — don't make user wait for background reload
  setIsFormOpen(false);
  setEditingOpportunity(null);

  // Optimistic update: patch the opportunity in-place so the list shows new data instantly
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

  if (!wasCreating && editingId) setUpdatingId(editingId);
  try {
    if (wasCreating) setCurrentPage(1);
    clearCacheByKey('Opportunity');
    await runMutationRefresh(
      () =>
        Promise.all([loadOpportunities(wasCreating ? 1 : currentPage, pageSize), loadTotalStats()]),
      { passes: 3, initialDelayMs: 80, stepDelayMs: 160 },
    );
  } catch (error) {
    console.error('[Opportunities] Error in handleSave:', error);
  } finally {
    setUpdatingId(null);
  }
};
```

**Step 3: Pass result through the form's onSubmit**

Find the form JSX near line 385 where `onSubmit` currently reads:

```js
onSubmit={async (result) => {
  logDev('[Opportunities] Form submitted with result:', result);
  await handleSave();
}}
```

Change to:

```js
onSubmit={async (result) => {
  logDev('[Opportunities] Form submitted with result:', result);
  await handleSave(result);
}}
```

**Step 4: Verify manually**

1. Open the Opportunities list page
2. Edit any opportunity — change the name, stage, or assigned employee
3. Save the form
4. Confirm the row updates immediately when the form closes, including `assigned_to_name` if you changed the assignee

**Step 5: Commit**

```bash
git add src/pages/Opportunities.jsx
git commit -m "feat(opportunities): optimistic list update after record edit"
```

---

### Task 4: Update CHANGELOG

**Files:**

- Modify: `CHANGELOG.md` — add entry under `## [Unreleased]`

**Step 1: Add changelog entry**

Under `### Changed` in `## [Unreleased]`:

```
- **Optimistic list updates for Contacts, Accounts, Opportunities (`src/pages/Contacts.jsx`, `src/pages/Accounts.jsx`, `src/pages/Opportunities.jsx`):** After saving a record edit, the list row now updates immediately using the result returned by the form, matching the existing Leads.jsx behaviour. The background `runMutationRefresh` still runs to confirm server state, but users no longer see stale row data while it completes.
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: update changelog for optimistic list updates"
```
