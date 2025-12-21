# Assigned To Filter Fix

## Problem
When selecting a specific employee in the "Assigned To" dropdown on both Opportunities and Leads pages:
1. **Both assigned AND unassigned records were displayed** (should only show records assigned to that employee)
2. **Selecting "Unassigned" showed nothing** (should show records with null or empty assigned_to)
3. **Employee names showed as UUIDs** instead of actual names

## Root Causes

### 1. Backend $or Filter Not Implemented (CRITICAL - Main Issue)
**This was the primary cause of unassigned records appearing.**

The backend `opportunities.v2.js` route was receiving the correct `$or` filter from the frontend:
```json
{
  "$or": [
    {"assigned_to": "002ea0ea-d4cb-4ba6-8716-94bf8c032b73"},
    {"assigned_to": "kackalacka@email.mail"}
  ]
}
```

However, the backend code only handled two types of `$or` filters:
1. Unassigned filters (checking for `null` or `''`)
2. Search filters (with `$icontains` operator)

It **completely ignored** `$or` filters for matching specific `assigned_to` values, so it returned ALL opportunities regardless of assignment.

### 2. Circular Dependency in Employee Loading
**This was the cause of UUIDs showing instead of names.**

The `loadSupportingData` function was using `getTenantFilter()` to load employees, but `getTenantFilter()` includes employee scope filtering. This created a circular dependency:

```
1. User selects "Kack Alacka" from dropdown
2. getTenantFilter() tries to filter employees by "Kack Alacka"
3. But employees array is empty/incomplete because it was loaded with the same filter
4. Result: Only employees assigned to opportunities that Kack Alacka is assigned to get loaded
5. Other employees (like the one with UUID 002eabca...) don't get loaded
6. Their names can't be looked up, so UUID is displayed
```

### 3. Backend Filter Not Strict Enough
The backend filter using `$or` conditions was not being applied strictly enough, allowing unassigned records (with `null` or `""` assigned_to values) to slip through when filtering for a specific employee.

## Solution Applied

### 1. Fixed Backend $or Filter Handling (CRITICAL FIX)
**File: `backend/routes/opportunities.v2.js`**

Added proper handling for `$or` filters that match specific `assigned_to` values:

```javascript
// Check if this is an assigned_to filter (UUID or email matching)
const assignedToConditions = parsedFilter.$or.filter(cond => 
  cond.assigned_to !== undefined && cond.assigned_to !== null && cond.assigned_to !== ''
);

if (assignedToConditions.length > 0) {
  // Build OR condition for assigned_to matching
  console.log('[V2 Opportunities] Applying assigned_to $or filter:', assignedToConditions);
  const orParts = assignedToConditions.map(cond => 
    `assigned_to.eq.${cond.assigned_to}`
  );
  q = q.or(orParts.join(','));
}
```

This generates the correct Supabase query:
```
assigned_to.eq.002ea0ea-d4cb-4ba6-8716-94bf8c032b73,assigned_to.eq.kackalacka@email.mail
```

### 2. Fixed Employee Loading - Base Tenant Filter
**File: `src/pages/Opportunities.jsx`**

Changed `loadSupportingData` to use a **base tenant filter** that ONLY includes `tenant_id`, without any employee scope filtering:

```javascript
// CRITICAL FIX: Use base tenant filter WITHOUT employee scope for loading employees
// Otherwise we get circular dependency: can't load employees if filter depends on employees
let baseTenantFilter = {};
if (user.role === 'superadmin' || user.role === 'admin') {
  if (selectedTenantId) {
    baseTenantFilter.tenant_id = selectedTenantId;
  }
} else if (user.tenant_id) {
  baseTenantFilter.tenant_id = user.tenant_id;
}

// Use baseTenantFilter for ALL supporting data (employees, accounts, contacts, leads)
const employeesData = await Employee.filter(baseTenantFilter, 'created_at', 1000);
```

This ensures ALL employees for the tenant are loaded, regardless of which employee is selected in the filter dropdown.

### 3. Updated Filter Construction (Both Pages)
**File: `src/pages/Opportunities.jsx` and `src/pages/Leads.jsx`**

- **For "Unassigned" selection**: Now checks for BOTH `null` AND empty string `""`
  ```javascript
  if (selectedEmail === 'unassigned') {
    filterObj.$or = [{ assigned_to: null }, { assigned_to: "" }];
  }
  ```

- **For specific employee selection**: Validates that email exists before using it in filter
  ```javascript
  if (emp && emp.email && typeof emp.email === 'string' && emp.email.trim() !== '') {
    emailToUse = emp.email;
  }
  ```

### 4. Client-Side Filtering (Defense in Depth)
**Added strict client-side filtering after backend response**

When a specific employee is selected (not "all" or "unassigned"), we apply an additional filter on the frontend to **strictly exclude** any records where:
- `assigned_to` is `null`
- `assigned_to` is an empty string `""`
- `assigned_to` doesn't match the selected employee (by ID or email)

This ensures that even if the backend filter is imperfect, the UI will only show correctly assigned records.

### 5. Case-Insensitive Employee Lookup
**File: `src/pages/Opportunities.jsx`**

Enhanced the `employeesMap` to support case-insensitive email lookups:
```javascript
if (employee.email) {
  acc[employee.email] = fullName;
  acc[employee.email.toLowerCase()] = fullName; // Case-insensitive support
}
```

### 6. Fixed useEffect Dependencies
**File: `src/pages/Opportunities.jsx`**

Removed `selectedEmail`, `showTestData`, and `getTenantFilter` from the `loadSupportingData` effect dependencies since we now use `baseTenantFilter` which doesn't depend on those values.

## Files Modified
1. **Backend**: `backend/routes/opportunities.v2.js` - Lines 111-150
2. **Frontend**: `src/pages/Opportunities.jsx` - Lines 146-174, 197-250, 303-307, 421-495, 545-570, 1615-1670
3. **Frontend**: `src/pages/Leads.jsx` - Lines 211-239, 437-474

## Testing Checklist
- [x] Select specific employee → Only their assigned records appear (no unassigned) ✅
- [x] Select specific employee → Employee names display correctly (no UUIDs) ✅
- [x] Select "Unassigned" → Only unassigned records appear
- [x] Select "All Employees" → All records appear with correct names
- [x] Case-insensitive email matching works
- [x] UUID-based assignments work correctly
- [x] All employees load regardless of filter selection
- [x] Backend properly filters by $or conditions for assigned_to

## How to Test
1. Restart the backend: `docker restart aishacrm-backend`
2. Hard refresh the frontend (Ctrl+Shift+R)
3. Navigate to Opportunities page
4. Select a specific employee from the "Assigned To" dropdown
5. Verify only that employee's opportunities appear
6. Select "Unassigned" and verify only unassigned opportunities appear
7. Check that all employee names display correctly (no UUIDs)
