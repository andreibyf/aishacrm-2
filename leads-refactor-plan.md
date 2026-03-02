# Leads.jsx Refactoring Plan

## Current State: 2,191 lines / 81 KB

### Structural Map

```
Lines 1-68        IMPORTS + LAZY LOADS (68 lines)
Lines 69-2191     LeadsPage FUNCTION (2,122 lines)
  ├── 74-209        27 useState declarations
  ├── 215-220       useRef declarations
  ├── 222-629       DATA LOADING (408 lines)
  │   ├── getTenantFilter callback
  │   ├── refreshAccounts callback
  │   ├── loadLeadFromUrl effect
  │   ├── loadSupportingData effect
  │   ├── loadTotalStats callback
  │   └── loadLeads callback (168 lines — the main data fetcher)
  ├── 631-690       EFFECTS — pagination, URL sync, AiSha event listener
  ├── 692-762       PAGINATION + MEMO (tags, user/employee/account maps)
  ├── 764-1219      CRUD + BULK HANDLERS (456 lines)
  │   ├── handleSave (33 lines)
  │   ├── handleDelete (32 lines)
  │   ├── handleBulkDelete (191 lines)
  │   ├── handleBulkStatusChange (96 lines)
  │   └── handleBulkAssign (98 lines)
  ├── 1221-1380     SELECTION + OTHER HANDLERS (160 lines)
  │   ├── toggleSelection, toggleSelectAll, handleSelectAllRecords
  │   ├── handleClearSelection, handleViewDetails, handleConvert
  │   ├── handleConversionSuccess, handleRefresh
  │   └── handleStatusFilterClick, handleClearFilters
  └── 1383-2190     RETURN JSX (807 lines)
      ├── 1405-1472   Modals/Dialogs (LeadForm, CsvImport, ConversionDialog, DetailPanel)
      ├── 1474-1582   Header + Action buttons
      ├── 1584-1665   Stats Cards (82 lines)
      ├── 1667-1770   Search + Filters (104 lines)
      ├── 1772-1825   Select All Banner
      ├── 1826-2100   Table/Card view (275 lines)
      └── 2100-2190   Pagination
```

### Already Extracted

- `LeadCard` — card view rendering
- `LeadForm` — create/edit form (lazy)
- `LeadDetailPanel` — detail side panel (lazy)
- `LeadConversionDialog` — lead conversion (lazy)
- `CsvImportDialog` — CSV import (lazy)
- `CsvExportButton` — CSV export button
- `BulkActionsMenu` — bulk actions dropdown

---

## Extraction Plan (5 Phases)

### Phase 1: Extract Data Loading → `src/hooks/useLeadsData.js` (408 lines)

**Impact: Biggest single extraction — removes all data fetching from the page**

This hook encapsulates:

- `getTenantFilter` callback
- `refreshAccounts` callback
- `loadSupportingData` effect (loads users, employees, accounts)
- `loadTotalStats` callback
- `loadLeads` callback (the main 168-line data fetcher with pagination, filtering, sorting)
- The related `useEffect` triggers for pagination/filter changes
- `loadLeadFromUrl` effect (deep-link handling)

**Input:** `selectedTenantId`, `employeeScope`, `statusFilter`, `searchTerm`, `sortField`, `sortDirection`, `ageFilter`, `selectedTags`, `showTestData`, `currentPage`, `pageSize`

**Output:** `{ leads, setLeads, users, employees, accounts, loading, totalStats, totalItems, setTotalItems, loadLeads, loadTotalStats, refreshAccounts, usersMap, employeesMap, accountsMap, getAssociatedAccountName, initialLoadDone }`

**File:** `src/hooks/useLeadsData.js`

**Verify:**

```bash
npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
```

**Commit:**

```
refactor(leads): extract data loading to useLeadsData hook
```

**Result:** 2,191 → ~1,783 lines

---

### Phase 2: Extract Bulk Operations → `src/hooks/useLeadsBulkOps.js` (390 lines)

**Impact: Removes the three most complex handlers**

The bulk operations (lines 830-1219):

- `handleBulkDelete` (191 lines) — with select-all-mode support, progress tracking, batch processing
- `handleBulkStatusChange` (96 lines) — batch status updates with progress
- `handleBulkAssign` (98 lines) — batch assignment with progress

All three follow the same pattern: confirm → fetch matching leads → batch process → reload.

**Input:** `leads`, `selectedLeads`, `selectAllMode`, `totalItems`, `getTenantFilter`, `statusFilter`, `searchTerm`, `selectedTags`, `loadLeads`, `loadTotalStats`, `startProgress`, `finishProgress`, `confirm`, `loadingToast`

**Output:** `{ handleBulkDelete, handleBulkStatusChange, handleBulkAssign }`

**File:** `src/hooks/useLeadsBulkOps.js`

**Verify:**

```bash
npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
```

**Commit:**

```
refactor(leads): extract bulk operations to useLeadsBulkOps hook
```

**Result:** ~1,783 → ~1,393 lines

---

### Phase 3: Extract Stats Cards → `src/components/leads/LeadStatsCards.jsx` (82 lines)

**Impact: Reusable component, clean prop boundary**

The stats cards section (lines 1584-1665) renders 7 status cards (Total, New, Contacted, Qualified, Unqualified, Converted, Lost) with click-to-filter behavior.

**Props:** `totalStats`, `statusFilter`, `handleStatusFilterClick`, `leadsLabel`

**File:** `src/components/leads/LeadStatsCards.jsx`

**Verify:**

```bash
npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
```

**Commit:**

```
refactor(leads): extract stats cards to LeadStatsCards component
```

**Result:** ~1,393 → ~1,311 lines

---

### Phase 4: Extract Table View → `src/components/leads/LeadTable.jsx` (275 lines)

**Impact: The table rendering + column headers + row rendering**

The table view section (lines 1826-2100) contains:

- Table headers with select-all checkbox
- Column headers (Name, Company, Status, Source, Score, Age, Assigned To, Actions)
- Row rendering with inline action buttons (view, edit, convert, delete)
- Empty state rendering
- Card view conditional (delegates to `LeadCard`)

**Props:** `leads`, `selectedLeads`, `selectAllMode`, `toggleSelection`, `toggleSelectAll`, `sortField`, `sortDirection`, `setSortField`, `setSortDirection`, `handleViewDetails`, `setEditingLead`, `setIsFormOpen`, `handleConvert`, `handleDelete`, `usersMap`, `employeesMap`, `accountsMap`, `getAssociatedAccountName`, `viewMode`, `leadsLabel`, `leadLabel`, `hasActiveFilters`

**File:** `src/components/leads/LeadTable.jsx`

**Verify:**

```bash
npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
```

**Commit:**

```
refactor(leads): extract table view to LeadTable component
```

**Result:** ~1,311 → ~1,036 lines

---

### Phase 5: Extract Search/Filter Bar → `src/components/leads/LeadFilters.jsx` (104 lines)

**Impact: Clean filter UI component**

The search + filter bar (lines 1667-1770) contains:

- Search input with icon
- Age filter dropdown
- Sort field dropdown
- Sort direction toggle
- Tag filter pills
- Clear filters button

**Props:** `searchTerm`, `setSearchTerm`, `ageFilter`, `setAgeFilter`, `ageBuckets`, `sortField`, `setSortField`, `sortDirection`, `setSortDirection`, `sortOptions`, `selectedTags`, `setSelectedTags`, `allTags`, `handleClearFilters`, `hasActiveFilters`

**File:** `src/components/leads/LeadFilters.jsx`

**Verify:**

```bash
npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
```

**Commit:**

```
refactor(leads): extract search/filter bar to LeadFilters component
```

**Result:** ~1,036 → ~932 lines

---

## Summary

| Phase     | Extraction                             | Lines Removed | Risk     | Time (Claude Code) |
| --------- | -------------------------------------- | ------------- | -------- | ------------------ |
| 1         | Data loading → useLeadsData hook       | ~408          | Low-Med  | 40 min             |
| 2         | Bulk operations → useLeadsBulkOps hook | ~390          | Low      | 30 min             |
| 3         | Stats cards → LeadStatsCards component | ~82           | Very Low | 15 min             |
| 4         | Table view → LeadTable component       | ~275          | Low      | 30 min             |
| 5         | Search/filters → LeadFilters component | ~104          | Very Low | 15 min             |
| **Total** |                                        | **~1,259**    |          | **~2.5 hours**     |

**Before:** 2,191 lines / 81 KB
**After:** ~932 lines / ~35 KB (57% reduction)

## File Structure After Refactoring

```
src/
├── hooks/
│   ├── useLeadsData.js               # Phase 1: data loading
│   └── useLeadsBulkOps.js            # Phase 2: bulk operations
├── components/
│   └── leads/
│       ├── LeadStatsCards.jsx         # Phase 3: stats cards
│       ├── LeadTable.jsx             # Phase 4: table + row rendering
│       ├── LeadFilters.jsx           # Phase 5: search + filter bar
│       ├── LeadCard.jsx              # (already exists)
│       ├── LeadForm.jsx              # (already exists)
│       ├── LeadDetailPanel.jsx       # (already exists)
│       ├── LeadConversionDialog.jsx  # (already exists)
│       └── BulkActionsMenu.jsx       # (already exists)
└── pages/
    ├── __tests__/
    │   └── Leads.smoke.test.jsx      # Smoke tests (write before starting)
    └── Leads.jsx                     # Slim page orchestrator (~932 lines)
```

## Smoke Tests

Write smoke tests at `src/pages/__tests__/Leads.smoke.test.jsx` BEFORE starting extractions. The tests should verify:

- Phase 0 (baseline): Page renders, shows header with "Leads" title
- Phase 1: Data hook — page loads without crash, loading state works
- Phase 2: Bulk ops — page renders with bulk action menu present
- Phase 3: Stats cards — 7 stats cards rendered
- Phase 4: Table — table element present with header row
- Phase 5: Filters — search input and filter dropdowns present

Run after EVERY phase:

```bash
npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
```

## Execution Strategy

1. Write smoke tests, run baseline
2. Phase 1 (data hook) is the highest-value extraction — do it first
3. Phase 2 (bulk ops) is independent of Phase 1
4. Phases 3-5 (JSX components) can go in any order
5. After all phases: full test suite run
6. Push and create PR

## What Stays in Leads.jsx

After all extractions:

- Imports + lazy loads
- 27 useState declarations (state stays in the page — hooks read it via params)
- Selection handlers (toggleSelection, toggleSelectAll, etc.) — small and tightly coupled
- handleSave, handleDelete (33 + 32 lines — too small to extract)
- handleConvert, handleConversionSuccess, handleRefresh
- The main return JSX orchestration (modals, header, composition of extracted components)

## Template Pattern for Other Entity Pages

Once Leads is done, the same pattern applies to:

- **Opportunities.jsx** — same structure (stats, filters, table, bulk ops)
- **Activities.jsx** — same structure
- **Contacts.jsx** — same structure
- **Accounts.jsx** — same structure

Each gets: `use[Entity]Data`, `use[Entity]BulkOps`, `[Entity]StatsCards`, `[Entity]Table`, `[Entity]Filters`.
