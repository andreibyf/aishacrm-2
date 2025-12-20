# Account → Customer Frontend Refactor Strategy

**Objective:** Rename "Account" to "Customer" throughout the frontend, with conditional B2B/B2C form structure based on `account_type` field.

**Scope:** Frontend only. Backend tables/routes remain as-is (`/api/v2/accounts` endpoint, `accounts` table).

---

## 1. Architecture Overview

### Current State
- Backend: `accounts` table with `account_type` (b2b|b2c) and `is_placeholder` fields
- Frontend: Generic "Account" references everywhere, single form for all types

### Target State
- Frontend: All UI references → "Customer"
- Form Logic: Conditional B2B (Company fields) vs B2C (Person fields)
- Data Flow: Same backend endpoints, smarter UI layer

### Mapping
```
Backend               Frontend UI
─────────────────────────────────
accounts table   →    Customers page
Account entity   →    Customer entity (alias)
AccountForm      →    CustomerForm (with B2B/B2C branches)
AccountCard      →    CustomerCard
```

---

## 2. File-by-File Impact Map

### 🔴 HIGH PRIORITY (Primary UX Layer)

#### Navigation & Routing
1. **`src/utils/navigationConfig.js`**
   - Line 16: Change `{ href: "Accounts", label: "Accounts" }` → `{ href: "Customers", label: "Customers" }`
   - Line 52: Change `Accounts: "accounts"` → `Customers: "accounts"` (keep backend module ID)
   - Line 71: Change `DuplicateAccounts: null` → `DuplicateCustomers: null`
   - Line 127: Update array entry
   - Impact: Navigation sidebar, module routing

2. **`src/pages/Accounts.jsx` → `src/pages/Customers.jsx`**
   - **Rename entire file** `Accounts.jsx` → `Customers.jsx`
   - Update internal references: `accountsLabel` logic stays, but display text becomes "Customers"
   - Import `useEntityLabel` already handles this: `{ plural: accountsLabel, singular: accountLabel }`
   - Impact: Main list page (1453 lines)

#### Page Components
3. **`src/pages/index.jsx`**
   - Update lazy import: Change `Accounts` route to `Customers`
   - Update component name in route registration

4. **`src/pages/DuplicateAccounts.jsx` → `src/pages/DuplicateCustomers.jsx`**
   - Rename file
   - Update all internal references from "Account" → "Customer"
   - Impact: Duplicate detection page

#### Component Files
5. **`src/components/accounts/` → `src/components/customers/`**
   - **Rename directory** from `accounts/` → `customers/`
   - Rename & update files:
     - `AccountForm.jsx` → `CustomerForm.jsx` (NEW: Add B2B/B2C conditional logic)
     - `AccountCard.jsx` → `CustomerCard.jsx`
     - `AccountDetailPanel.jsx` → `CustomerDetailPanel.jsx`
     - `AccountDetailPanel.jsx` → `CustomerDetailPanel.jsx`
     - `CreateAccountDialog.jsx` → `CreateCustomerDialog.jsx`
     - `BulkActionsMenu.jsx` → stays (no renaming needed, but update imports)

#### Selectors/Pickers
6. **`src/components/shared/AccountSelector.jsx` → `src/components/shared/CustomerSelector.jsx`**
   - Rename file
   - Update labels & UI text

7. **`src/components/shared/LazyAccountSelector.jsx` → `src/components/shared/LazyCustomerSelector.jsx`**
   - Rename file

8. **`src/components/shared/SearchableAccountSelector.jsx` → `src/components/shared/SearchableCustomerSelector.jsx`**
   - Rename file

### 🟡 MEDIUM PRIORITY (Supporting/Cross-cutting)

#### API Layer
9. **`src/api/entities.js`**
   - Line 163: Rename check: `const isCustomer = entityName === 'Customer';` (was `isAccount`)
   - Line 166: Update condition check
   - Line 173-174: Route remains `/v2/accounts` (backend)
   - Export change: `export const Customer = createEntity("Customer");` (was `Account`)
   - Impact: Entity factory, validation

10. **`src/api/functions.js`**
    - Rename exports: `deleteCustomer`, `createCustomer`, `updateCustomer` (wrap existing Account exports)
    - These are proxies to fallbackFunctions; mainly for consistency

#### Hooks & Context
11. **`src/hooks/useEntityForm.js`** (if Account-specific)
    - Review for Account-specific logic
    - Likely no changes needed (generic entity hook)

#### Dashboard
12. **`src/components/dashboard/TopAccounts.jsx` → `src/components/dashboard/TopCustomers.jsx`**
    - Rename file
    - Update labels

#### Selectors (Forms)
13. **`src/components/shared/EmployeeSelector.jsx`**
    - If it filters by "Account", add B2B/B2C awareness
    - Likely no changes (selector for employees assigned to customers)

14. **`src/utils/industryUtils.js`** (if exists)
    - Review for Account-specific logic
    - Likely no changes (generic industry formatting)

### 🟢 LOW PRIORITY (References/Text)

#### Test Files
15. **`src/components/accounts/__tests__/AccountForm.test.jsx` → `src/components/customers/__tests__/CustomerForm.test.jsx`**
    - Rename file
    - Update test descriptions & assertions

#### Documentation Pages
16. **`src/pages/Documentation.jsx`**
    - Line 538: Change "Account Management" → "Customer Management"
    - Line 593: Update filter text
    - Multiple references to "Account" → "Customer"
    - Grep for "Contact & Account" → "Contact & Customer"

#### Bulk Actions
17. **`src/components/customers/BulkActionsMenu.jsx`**
    - Update labels: "Bulk Account Actions" → "Bulk Customer Actions"
    - Update action descriptions

#### Audit Log
18. **`src/pages/AuditLog.jsx`**
    - Line 226: Change `<SelectItem value="Account">Accounts</SelectItem>` → `<SelectItem value="Customer">Customers</SelectItem>`

#### CashFlow Page (if references Accounts)
19. **`src/pages/CashFlow.jsx`**
    - Review if it loads/displays Accounts
    - Update labels if needed

#### Utilities & Helpers
20. **`src/utils/labelUtils.js`** (if exists)
    - Add "customer" entity label mapping

---

## 3. New Feature: Conditional B2B/B2C Form Structure

### File: `src/components/customers/CustomerForm.jsx`

**Current Structure:**
```jsx
<>
  <div>Industry field</div>
  <div>Employee count field</div>
  <div>Website field</div>
  {/* All fields visible for all account types */}
</>
```

**Target Structure:**
```jsx
{/* B2B Section */}
{customer?.account_type === 'b2b' && (
  <>
    <fieldset>
      <legend>Company Information</legend>
      <Field>Industry</Field>
      <Field>Website</Field>
      <Field>Employee count</Field>
      <Field>Annual revenue</Field>
      <Field>Address (company)</Field>
    </fieldset>
  </>
)}

{/* B2C Section */}
{customer?.account_type === 'b2c' && (
  <>
    <fieldset>
      <legend>Individual Information</legend>
      <Field>Job title</Field>
      <Field>Phone (personal)</Field>
      <Field>Email (personal)</Field>
      <Field>Address (personal)</Field>
    </fieldset>
  </>
)}

{/* Common Section */}
<fieldset>
  <legend>Relationship</legend>
  <Field>Status</Field>
  <Field>Tags</Field>
  <Field>Assigned to</Field>
  <Field>Health status</Field>
</fieldset>
```

**Implementation Details:**
- Add `account_type` field to form state (read-only display, set during creation)
- Create separate form sections as React components
- Use conditional rendering based on `customer.account_type`
- Add visual grouping with `<fieldset>` + legend
- Preserve validation logic for both types

### File: `src/components/customers/CustomerCard.jsx`

**Changes:**
- Show appropriate fields based on `account_type`
- B2B: Company name, industry, employee count
- B2C: First/last name, job title
- Badge to show type (with icon)

---

## 4. Implementation Sequence

### Phase 1: File Structure (Non-Breaking)
1. Create new `src/components/customers/` directory
2. Copy Account components with new names
3. Create aliases in `src/api/entities.js` for backward compatibility
4. Update imports in `src/pages/Customers.jsx`
5. **Staging:** Both old & new code coexist

### Phase 2: Route & Navigation
1. Add new route: `Customers` → points to `src/pages/Customers.jsx`
2. Update `navigationConfig.js`
3. Update `index.jsx` lazy imports
4. Keep old `Accounts` route as fallback redirect

### Phase 3: Component Updates
1. Update `CustomerForm.jsx` with B2B/B2C conditional logic
2. Update `CustomerCard.jsx` with conditional fields
3. Update `CustomerDetailPanel.jsx`
4. Update selectors: `CustomerSelector`, `LazyCustomerSelector`, `SearchableCustomerSelector`

### Phase 4: Cross-cutting Updates
1. `src/api/entities.js` exports
2. `src/utils/navigationConfig.js`
3. `src/pages/Documentation.jsx`
4. `src/pages/AuditLog.jsx`

### Phase 5: Cleanup & Testing
1. Remove old `src/components/accounts/` (after validation)
2. Remove old `src/pages/Accounts.jsx` (after validation)
3. Remove `DuplicateAccounts.jsx` or rename to `DuplicateCustomers.jsx`
4. Test E2E: Create → View → Edit → Delete customer (B2B & B2C)

---

## 5. Backward Compatibility Strategy

### Option A: Hard Cutover (Recommended)
- Remove old routes immediately
- Users redirected to new Customer page
- Old Account references become 404
- Pro: Clean, no confusion
- Con: Requires version bump, migration guide

### Option B: Dual Routes
- Keep both `/Accounts` and `/Customers` routes
- Both point to same backend
- Gradually deprecate `Accounts`
- Pro: Smooth migration
- Con: Confusing UI, longer cleanup

**Recommendation:** Option A + Add a migration banner explaining change

---

## 6. Field Mapping Reference

### Database Schema (Backend)
```sql
accounts table:
  id, tenant_id, name, account_type (b2b|b2c), is_placeholder
  [B2B fields]:    industry, website, employee_count, annual_revenue
  [B2C fields]:    phone, email, address_*, person_id
  [Common fields]: health_status, ai_action, tags, metadata, created_at, updated_at
```

### UI Display (B2B Customer Form)
```
Customer Name           (text, required)
Type: Company           (read-only badge)
Industry               (dropdown)
Website                (text, URL)
Employee Count         (number)
Annual Revenue         (currency)
Health Status          (select)
Assigned To            (employee picker)
Tags                   (multi-select)
Address                (address fields)
```

### UI Display (B2C Customer Form)
```
First Name             (text, required)
Last Name              (text, required)
Type: Individual       (read-only badge)
Phone                  (phone input)
Email                  (email input)
Job Title              (text)
Health Status          (select)
Assigned To            (employee picker)
Tags                   (multi-select)
Address                (address fields)
```

---

## 7. Testing Checklist

- [ ] Navigation: "Customers" appears in sidebar, "Accounts" removed
- [ ] Create B2B: Form shows company fields
- [ ] Create B2C: Form shows individual fields
- [ ] List View: Shows appropriate fields per type
- [ ] Detail Panel: Displays correct field set
- [ ] Edit: Form repopulates with correct type fields
- [ ] Delete: Removes customer correctly
- [ ] Search: Filters work across both types
- [ ] Export: CSV includes appropriate columns
- [ ] API calls: Still hit `/api/v2/accounts` (backend unchanged)
- [ ] Performance: No regression in load times

---

## 8. Files Requiring Changes (Summary Table)

| File | Change Type | Priority | Effort |
|------|-------------|----------|--------|
| `navigationConfig.js` | Text update | High | 1 line |
| `Accounts.jsx` → `Customers.jsx` | Rename + import updates | High | 10 lines |
| `accounts/` → `customers/` | Directory rename | High | File ops |
| `CustomerForm.jsx` | NEW: B2B/B2C branches | High | ~50 lines |
| `CustomerCard.jsx` | Conditional fields | High | ~30 lines |
| `CustomerDetailPanel.jsx` | Conditional display | High | ~20 lines |
| `entities.js` | Export rename | Medium | 5 lines |
| `Documentation.jsx` | Text updates | Low | 5 lines |
| `AuditLog.jsx` | Text update | Low | 1 line |
| Selectors (3 files) | Rename + import | Medium | File ops |
| `DuplicateAccounts.jsx` | Rename | Low | File ops |
| Test files | Update descriptions | Low | 10 lines |

**Total Estimated Effort:** 2-3 hours (mostly file renames + form conditional logic)

---

## 9. Decision Points

### Should we rename backend routes?
**Decision: NO** - Keep `/api/v2/accounts` unchanged. Frontend is a UI layer; backend domain model stays stable.

### Single page or separate B2B/B2C pages?
**Decision: Single page with form branches** - Simpler, unified list experience. Conditional form sections based on type.

### Rename `Account.js` entity to `Customer.js`?
**Decision: Keep `Account.js` internally, export as `Customer` alias** - Minimal backend coupling. One-line change.

### Update DocumentManagement, CashFlow, etc?
**Decision: Review per component** - Only update if they directly reference Accounts for display. API calls stay the same.

---

## 10. Success Criteria

✅ User navigates to "Customers" page (sidebar shows "Customers")
✅ Creating B2B customer shows company-focused form
✅ Creating B2C customer shows individual-focused form
✅ Existing customers still load correctly from backend
✅ All API calls still hit `/api/v2/accounts` (no breaking changes)
✅ No console errors or broken imports
✅ List/Detail/Edit workflows complete without errors
✅ Search, filter, export still work
✅ Performance metrics unchanged

---

## 11. Post-Launch Enhancements

1. **Customer Lifecycle Indicator**
   - Show stage: Lead → Contact → Customer (on detail view)
   - Visual timeline

2. **B2B/B2C Analytics**
   - Separate metrics dashboard
   - Pipeline breakdown by type

3. **Bulk Type Change**
   - Allow converting B2C → B2B (re-link to company)

4. **Smart Defaults**
   - Pre-fill company name from parent Account (B2B)
   - Auto-create placeholder account on B2C conversion

---

**Next Action:** User approval on:
- [ ] Proceed with Hard Cutover (remove old Account routes)
- [ ] Keep backward-compatible dual routes
- [ ] Defer B2B/B2C form splitting (rename only)
