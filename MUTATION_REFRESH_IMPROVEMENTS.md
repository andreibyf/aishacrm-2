# Mutation & Refresh Improvements

**Date:** February 21, 2026  
**Scope:** Comprehensive data refresh and page reload enhancements

## 🎯 Objectives Achieved

1. ✅ **Full page reload** for critical operations affecting global state
2. ✅ **Standardized mutation wrapper** utility for consistent refresh patterns
3. ✅ **Progress bars verified** for all bulk delete operations

---

## 📦 New Files Created

### `src/utils/mutationWrapper.js`

Standardized wrapper utility for CRUD operations providing:

- Automatic cache clearing after mutations
- Consistent error handling
- Optional full page reload for critical operations
- Batch operation support with progress tracking

**Exports:**

- `withMutation()` - Generic mutation wrapper
- `withDelete()` - Delete operation wrapper
- `withUpdate()` - Update operation wrapper
- `withCreate()` - Create operation wrapper
- `withBatchOperation()` - Batch processing with progress

---

## 🔄 Files Modified

### Data Refresh Enhancements

#### 1. **DocumentManagement.jsx**

- Added `loadDocuments()` call after deletion (success and error cases)
- Ensures UI stays in sync with server state

#### 2. **Customers.jsx**

- Added `useProgress` import
- Implemented progress bars for bulk delete (both select-all and selected)
- Structured batch deletion with success/fail tracking
- 404 errors handled gracefully (don't count as failures)
- Proper `completeProgress()` called in all code paths

---

### Page Reload for Critical Operations

The following operations now trigger `window.location.reload()` after a brief delay (1000-1500ms) to allow toast messages to be visible:

#### 3. **ClientOffboarding.jsx**

- **Operation:** Tenant deletion with all data
- **Reload delay:** 1500ms
- **Reason:** Complete data wipe requires full app refresh

#### 4. **TenantManagement.jsx**

- **Operation:** Tenant deletion
- **Reload delay:** 1500ms
- **Reason:** Tenant removal affects global navigation and context

#### 5. **TenantSetup.jsx**

- **Operation:** Tenant creation/update
- **Reload delay:** 1000ms
- **Reason:** New/updated tenant data affects app-wide state and routing

#### 6. **BizDevSources.jsx**

- **Operation:** CSV import completion
- **Reload delay:** 1500ms
- **Reason:** Large imports can significantly change data landscape

#### 7. **TenantIntegrationSettings.jsx**

- **Operations:**
  - Integration create/update
  - Integration delete
- **Reload delay:** 1000ms
- **Reason:** Integration changes affect webhooks, email settings, and external APIs

---

## ✅ Progress Bar Coverage Verified

All bulk delete operations confirmed to have progress indicators:

| Page                  | Has Progress Bar | Notes                                                 |
| --------------------- | ---------------- | ----------------------------------------------------- |
| **Contacts.jsx**      | ✅ Yes           | `startProgress`, `updateProgress`, `completeProgress` |
| **Leads.jsx**         | ✅ Yes           | Full progress tracking with batch processing          |
| **Opportunities.jsx** | ✅ Yes           | Progress bars for both select-all and selected        |
| **Accounts.jsx**      | ✅ Yes           | Comprehensive progress tracking                       |
| **Activities.jsx**    | ✅ Yes           | Progress support implemented                          |
| **Customers.jsx**     | ✅ **NOW FIXED** | Added progress bars (was missing)                     |

---

## 🔍 Pattern Analysis

### Standard Delete Pattern

```javascript
const handleDelete = async (id) => {
  try {
    await Entity.delete(id);
    clearCacheByKey('Entity');
    await Promise.all([loadEntities(), loadTotalStats()]);
    toast.success('Deleted successfully');
  } catch (error) {
    console.error('Delete failed:', error);
    toast.error('Failed to delete');
    await loadEntities(); // Refresh even on error to sync UI
  }
};
```

### Bulk Delete with Progress Pattern

```javascript
const handleBulkDelete = async () => {
  startProgress({ message: 'Deleting items...', total: items.length });

  const BATCH_SIZE = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((item) => delete item.id));

    results.forEach((r) => {
      if (r.status === 'fulfilled') successCount++;
      else {
        const is404 = r.reason?.response?.status === 404;
        if (!is404) failCount++;
        else successCount++; // Count 404s as success
      }
    });

    updateProgress({
      current: successCount + failCount,
      message: `Deleted ${successCount} of ${items.length}...`,
    });
  }

  completeProgress();
  clearCacheByKey('Entity');
  await loadData();
};
```

### Critical Operation with Reload Pattern

```javascript
const handleCriticalOperation = async () => {
  try {
    await performOperation();
    toast.success('Operation completed');

    // Reload page after brief delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    toast.error('Operation failed');
  }
};
```

---

## 🚀 Usage Examples

### Using the Mutation Wrapper

```javascript
import { withDelete, withUpdate, withCreate } from '@/utils/mutationWrapper';

// Simple delete with refresh
await withDelete({
  deleteOperation: () => Account.delete(id),
  entityType: 'Account',
  refreshOperation: async () => {
    await Promise.all([loadAccounts(), loadStats()]);
  },
  successMessage: 'Account deleted',
});

// Update with full page reload (for critical changes)
await withUpdate({
  updateOperation: () => Tenant.update(id, data),
  entityType: 'Tenant',
  refreshOperation: loadTenants,
  successMessage: 'Tenant updated',
  forceReload: true, // Will reload page after 300ms
});

// Batch operation with progress
import { withBatchOperation } from '@/utils/mutationWrapper';

const { successCount, failCount } = await withBatchOperation({
  items: selectedItems,
  operation: (item) => Contact.delete(item.id),
  progressCallbacks: { startProgress, updateProgress, completeProgress },
  itemName: 'contacts',
  batchSize: 50,
});
```

---

## 🎯 Benefits

1. **Consistent UX**: All operations now have predictable refresh behavior
2. **Data Integrity**: UI always reflects server state after mutations
3. **User Feedback**: Progress bars show status for long-running bulk operations
4. **Error Resilience**: Even failed operations refresh to sync UI state
5. **Global State Safety**: Critical operations reload page to ensure all components update
6. **Developer Experience**: Mutation wrapper simplifies implementing standard patterns

---

## 📊 Impact Summary

- **Files Modified:** 8
- **New Utilities:** 1 (mutationWrapper.js)
- **Operations Enhanced:** 15+
- **Progress Bars Added:** 2 (Customers.jsx bulk delete operations)
- **Page Reloads Added:** 6 critical operations
- **Patterns Standardized:** Delete, Update, Create, Bulk operations

---

## 🔜 Future Enhancements

1. **Migrate existing operations** to use `mutationWrapper.js` utilities
2. **Add progress tracking** to other long-running operations (exports, reports)
3. **Implement optimistic UI updates** with automatic rollback on failure
4. **Add retry logic** for failed operations in batch processing
5. **Create React hooks** wrapping mutation utilities for cleaner component code

---

## ⚠️ Breaking Changes

None. All changes are backwards compatible and enhance existing functionality.

---

## 🧪 Testing Recommendations

1. **Delete Operations**: Verify data refreshes immediately after deletion
2. **Bulk Operations**: Confirm progress bars appear and update correctly
3. **Tenant/Integration Changes**: Verify page reloads after critical operations
4. **Error Cases**: Ensure UI refreshes even when operations fail
5. **Network Conditions**: Test with slow connections to verify progress tracking
6. **404 Handling**: Confirm 404 errors don't count as failures in bulk deletes

---

## 📝 Notes

- Page reload delays (1000-1500ms) allow users to see success messages before refresh
- All progress implementations handle 404 errors gracefully (already deleted items)
- Cache clearing happens before data refresh to ensure fresh data
- Error cases also trigger data refresh to maintain UI/server synchronization
