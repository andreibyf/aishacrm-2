# User.me() → useUser Migration Guide

## 🎯 Overview
This guide documents the pattern for migrating components from direct `User.me()` API calls to the centralized `useUser` hook.

**Status:** 18+ components migrated, 27 remaining  
**Impact:** ~95% reduction in User.me() API calls  
**Effort:** ~5-10 minutes per component  

---

## ✅ Migration Pattern

### Before (❌ Old Pattern)
```jsx
import { useState, useEffect } from 'react';
import { User } from "@/api/entities";

export default function MyComponent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    setLoading(true);
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <div>No user</div>;

  return (
    <div>
      <p>Welcome, {currentUser.email}</p>
      <p>Role: {currentUser.role}</p>
    </div>
  );
}
```

### After (✅ New Pattern)
```jsx
import { useUser } from "@/hooks/useUser";

export default function MyComponent() {
  const { user: currentUser, loading } = useUser();

  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <div>No user</div>;

  return (
    <div>
      <p>Welcome, {currentUser.email}</p>
      <p>Role: {currentUser.role}</p>
    </div>
  );
}
```

---

## 📋 Step-by-Step Migration Checklist

### 1. **Add useUser Import**
```jsx
// Add this import at the top
import { useUser } from "@/hooks/useUser";
```

### 2. **Remove Old Imports**
```jsx
// Remove these:
import { User } from "@/api/entities";  // ❌ Remove
```

### 3. **Remove State Management**
```jsx
// Remove these state declarations:
const [currentUser, setCurrentUser] = useState(null);  // ❌ Remove
const [loading, setLoading] = useState(true);          // ❌ Remove
const [user, setUser] = useState(null);                // ❌ Remove
```

### 4. **Remove useEffect Hook**
```jsx
// Remove entire useEffect:
useEffect(() => {                    // ❌ Remove
  async function loadUser() {        // ❌ Remove
    const user = await User.me();    // ❌ Remove
    setCurrentUser(user);            // ❌ Remove
  }                                  // ❌ Remove
  loadUser();                        // ❌ Remove
}, []);                              // ❌ Remove
```

### 5. **Add useUser Hook**
```jsx
// Add this ONE line:
const { user: currentUser, loading } = useUser();  // ✅ Add
```

### 6. **Update Refetch Functions (if any)**
```jsx
// Before:
const loadUser = async () => {
  const user = await User.me();
  setCurrentUser(user);
};

// After:
const { refetch } = useUser();  // Include refetch in destructuring
const loadUser = async () => {
  await refetch();
};
```

### 7. **Verify User Schema**
User objects from `useUser` are already normalized with:
- ✅ Snake_case fields: `is_superadmin`, `tenant_id`, `employee_id`
- ✅ Lowercase roles: `'admin'`, `'manager'`, `'superadmin'`
- ✅ Consistent permissions object
- ✅ Computed fields: `full_name`, `display_name`

---

## 🔍 Common Patterns

### Pattern 1: Simple User Display
```jsx
// Before
const [user, setUser] = useState(null);
useEffect(() => {
  User.me().then(setUser);
}, []);

// After
const { user } = useUser();
```

### Pattern 2: Conditional Rendering
```jsx
// Before
if (!currentUser) return <div>Loading...</div>;

// After
const { user: currentUser, loading } = useUser();
if (loading) return <div>Loading...</div>;
if (!currentUser) return <div>No user</div>;
```

### Pattern 3: Tenant Filtering
```jsx
// Before
const user = await User.me();
const tenantId = user?.tenant_id;

// After
const { user } = useUser();
const tenantId = user?.tenant_id;  // Same logic!
```

### Pattern 4: Role Checks
```jsx
// Before
const user = await User.me();
if (user.role === 'Admin') { /* ... */ }

// After
const { user } = useUser();
// ⚠️ Note: role is now lowercase!
if (user.role === 'admin') { /* ... */ }
```

### Pattern 5: Superadmin Detection
```jsx
// Before
const user = await User.me();
const isSuperadmin = user.role === 'Superadmin';

// After
const { user } = useUser();
const isSuperadmin = user.is_superadmin;  // ✅ Use boolean flag!
```

### Pattern 6: useCallback with User Dependency
```jsx
// Before
const loadData = useCallback(async () => {
  const user = await User.me();
  // ... use user
}, []);

// After
const { user } = useUser();
const loadData = useCallback(async () => {
  if (!user) return;  // Guard clause
  // ... use user
}, [user]);  // Add user to deps
```

---

## 🎯 Priority Targets (27 Remaining)

### 🔥 High Priority - Settings Components (9)
**Why:** Frequently accessed, simple patterns, quick wins

1. **UserInfo.jsx** (5 min)
   - Simple user display
   - Has cleanup function → use `refetch()` after cleanup
   
2. **TenantIntegrationSettings.jsx** (8 min)
   - Pattern: `const user = await User.me()` in `loadIntegrations`
   - Has `selectedTenantId` dependency → add `user` to deps
   
3. **WebhookEmailSettings.jsx** (8 min)
   - Same pattern as TenantIntegrationSettings
   - useCallback with tenant filter
   
4. **StripeSettings.jsx** (5 min)
   - Simple user + tenant_id pattern
   - Just swap User.me() for useUser
   
5. **IntegrationSettings.jsx** (7 min)
   - Similar to TenantIntegrationSettings
   
6. **DatabaseSettings.jsx** (5 min)
   - Promise.all with User.me() → just use useUser
   
7. **BrandingSettings.jsx** (6 min)
   - Two User.me() calls → both use useUser
   
8. **BillingSettings.jsx** (5 min)
   - Promise.all pattern
   
9. **AdminOpenAISettings.jsx** (5 min)
   - Simple user settings load

### ⚡ Medium Priority - Shared Utilities (8)
**Why:** Used across app, moderate complexity

10. **CsvImportDialog.jsx** (6 min)
    - User.me() in handleImport
    - Just add useUser at component level
    
11. **LinkContactDialog.jsx** (5 min)
    - User.me() for tenant_id
    
12. **NotifyAdminOnInvite.jsx** (7 min)
    - User.me() in notification handler
    
13. **ModuleManager.jsx** (8 min)
    - Promise.all([User.me()]) pattern
    
14. **EmailTemplateManager.jsx** (8 min)
    - Two User.me() calls in different functions
    
15. **TenantIdViewer.jsx** (5 min)
    - Simple user display
    
16. **DocumentPicker.jsx** (6 min)
    - User.me() in file picker
    
17. **TenantSetup.jsx** (10 min)
    - Complex setup flow
    - Consider leaving for last

### 🔧 Lower Priority - Feature Components (10)
**Why:** Less frequently used, more complex logic

18. **LeadConversionDialog.jsx** (7 min)
19. **ResendInviteButton.jsx** (5 min)
20. **EmployeeFilter.jsx** (6 min)
21. **ReceiptSelector.jsx** (6 min)
22. **CashFlowForm.jsx** (7 min)
23. **AICampaignForm.jsx** (8 min)
24. **ChatWindow.jsx** (8 min)
25. **FloatingAIWidget.jsx** (6 min)
26. **AgentChat.jsx** (7 min)
27. **AICallActivityForm.jsx** (7 min)

---

## ⚠️ Common Pitfalls

### Pitfall 1: Forgetting Role is Lowercase
```jsx
// ❌ Wrong
if (user.role === 'Admin') { /* ... */ }

// ✅ Correct
if (user.role === 'admin') { /* ... */ }
```

### Pitfall 2: Using isSuperadmin vs is_superadmin
```jsx
// ❌ Wrong (camelCase doesn't exist)
if (user.isSuperadmin) { /* ... */ }

// ✅ Correct (snake_case)
if (user.is_superadmin) { /* ... */ }
```

### Pitfall 3: Not Adding User to Dependencies
```jsx
// ❌ Wrong
const { user } = useUser();
const loadData = useCallback(async () => {
  // Uses user but not in deps
}, []);  // Missing user!

// ✅ Correct
const { user } = useUser();
const loadData = useCallback(async () => {
  if (!user) return;
  // Uses user
}, [user]);  // Include user in deps
```

### Pitfall 4: Removing Guard Clauses
```jsx
// ❌ Wrong (can crash if user null)
const { user } = useUser();
const tenantId = user.tenant_id;  // Crashes if user is null!

// ✅ Correct (always guard)
const { user } = useUser();
const tenantId = user?.tenant_id;  // Optional chaining
```

### Pitfall 5: Not Handling Loading State
```jsx
// ❌ Wrong (renders before user loads)
const { user } = useUser();
return <div>{user.email}</div>;  // Crashes on initial render!

// ✅ Correct (handle loading)
const { user, loading } = useUser();
if (loading) return <div>Loading...</div>;
if (!user) return null;
return <div>{user.email}</div>;
```

---

## 🧪 Testing After Migration

### 1. **Unit Tests**
Run the automated test suite:
```
Navigate to: http://localhost:4000/UnitTests
Click: "Run All Tests"
Verify: All "User Context & Normalization" tests pass
```

### 2. **Manual Verification**
For each migrated component:
- [ ] Open component in browser
- [ ] Check DevTools → Network tab
- [ ] Verify: NO new `/api/users/me` calls
- [ ] Verify: Component displays correctly
- [ ] Verify: No console errors

### 3. **Role-Based Testing**
Test with different roles:
- [ ] Admin: Can access settings, sees all records
- [ ] Manager: Can access their data
- [ ] Employee: Limited access

---

## 📊 Performance Metrics

### Before Migration (per component)
- API Calls: 1 User.me() call per component mount
- Network: ~200-500ms per call
- Total (5 components on page): ~5 API calls = 1-2.5s overhead

### After Migration (centralized)
- API Calls: 1 User.me() call at app startup
- Network: ~200-500ms ONCE
- Total (5 components on page): 0 additional calls = 0ms overhead

### Improvement
- **95% fewer API calls**
- **Faster page loads**
- **Reduced server load**

---

## 🚀 Batch Migration Strategy

### Recommended Approach
1. **Start with Settings** (9 components, ~1 hour total)
   - Simple patterns
   - High visibility
   - Quick wins

2. **Move to Shared Utilities** (8 components, ~1 hour total)
   - Moderate complexity
   - Wide impact

3. **Finish with Features** (10 components, ~1.5 hours total)
   - Complex logic
   - Less frequent use

### Time Estimates
- **Simple component:** 5 minutes
- **Medium component:** 7-8 minutes
- **Complex component:** 10 minutes
- **Total remaining:** ~3.5 hours work

### Batch Sizes
- **Small batch:** 3-5 components at once
- **Test after each batch**
- **Commit after successful test**

---

## 📝 Commit Template

```bash
git add .
git commit -m "refactor(settings): migrate [Component Names] to useUser hook

- Remove direct User.me() calls in [list components]
- Use centralized UserContext via useUser hook
- Add user dependency to useCallback where needed
- Update role comparisons to lowercase (admin, manager)
- Verify all tests passing

Part of ongoing User.me() → useUser migration (18→26 migrated)"
```

---

## 🔗 Related Files

- **Hook:** `src/hooks/useUser.js`
- **Context:** `src/components/shared/UserContext.jsx`
- **Utility:** `src/utils/normalizeUser.js`
- **Tests:** `src/components/testing/userContextTests.jsx`
- **Integration Tests:** `src/components/testing/userMigrationIntegrationTests.jsx`

---

## 💡 Tips & Tricks

### Tip 1: Use Find & Replace
```
Find: const user = await User.me();
Replace: // const user = await User.me(); // TODO: Use useUser hook
```
Then systematically fix each occurrence.

### Tip 2: Check Multiple Calls
Some components call `User.me()` in multiple places:
- Initial load (useEffect)
- Refresh functions
- Event handlers

Make sure to catch ALL occurrences!

### Tip 3: Test in Isolation
Use the component in isolation before testing in full app flow.

### Tip 4: Watch for Promise.all
```jsx
// Before
const [user, data] = await Promise.all([
  User.me(),
  fetchData()
]);

// After
const { user } = useUser();  // At component level
const data = await fetchData();  // In function
```

---

## ✅ Success Checklist

After migrating a component, verify:
- [ ] Removed `import { User } from "@/api/entities"`
- [ ] Added `import { useUser } from "@/hooks/useUser"`
- [ ] Removed all `useState` for user
- [ ] Removed all `useEffect` with User.me()
- [ ] Added `const { user } = useUser()` (or destructure what you need)
- [ ] Updated all `user.role` comparisons to lowercase
- [ ] Changed `user.role === 'Superadmin'` to `user.is_superadmin`
- [ ] Added loading/null guards
- [ ] Added user to useCallback dependencies (if applicable)
- [ ] Tested component loads without errors
- [ ] Verified no new /api/users/me calls in Network tab
- [ ] All automated tests still pass

---

**Good luck with the migration! 🎉**

*Last Updated: November 9, 2025*  
*Migration Progress: 18/45 components (40% complete)*
