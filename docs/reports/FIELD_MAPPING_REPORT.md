# Field Mapping Report: Database Schema vs UI/API References

**Generated:** 2025-11-12  
**Purpose:** Document field locations (direct columns vs metadata JSONB) and identify missing fields

---

## 📊 Summary

### Fields NOT FOUND (Missing Columns)
These fields are referenced in code but don't exist in the database:

| Table | Missing Field | Used In |
|-------|---------------|---------|
| **accounts** | `owner_id` | Braid tools, AI routes |
| **accounts** | `phone` | Braid tools |
| **accounts** | `num_employees` | Metadata definitions |
| **contacts** | `owner_id` | Braid tools, AI routes |
| **leads** | `owner_id` | Braid tools |
| **opportunities** | `owner_id` | Braid tools, AI routes |
| **activities** | `owner_id` | Braid tools, AI routes |
| **activities** | `related_to_type` | Braid tools |
| **activities** | `related_to_id` | Braid tools |

---

## 📋 Table-by-Table Breakdown

### **ACCOUNTS**
**Direct Columns:** (10 fields)
- `id`, `tenant_id`, `name`, `industry`, `website`
- `created_at`, `type`, `updated_at`, `created_date`, `annual_revenue`

**Metadata JSONB:** (empty/null)

**Issues:**
- ❌ `owner_id` - Referenced in Braid tools but missing
- ❌ `phone` - Referenced in Braid account type definitions
- ❌ `num_employees` - Referenced in AccountMetadata type

---

### **CONTACTS**
**Direct Columns:** (11 fields)
- `id`, `tenant_id`, `first_name`, `last_name`, `email`
- `phone`, `account_id`, `created_at`, `status`, `updated_at`, `created_date`

**Metadata JSONB:** (17 fields)
- `job_title` ✅ (stored in metadata)
- `zip`, `city`, `state`, `country`, `address_1`, `address_2`
- `tags`, `mobile`, `department`, `assigned_to`
- `tenant_id`, `last_synced`, `lead_source`
- `account_name`, `account_industry`, `is_test_data`

**Issues:**
- ✅ `job_title` - In metadata JSONB (correctly referenced)
- ✅ `phone` - Direct column (correctly referenced)
- ❌ `owner_id` - Referenced in Braid tools but missing

**Fix Required:** Braid contacts.braid should reference `assigned_to` from metadata instead of `owner_id`

---

### **LEADS**
**Direct Columns:** (13 fields)
- `id`, `tenant_id`, `first_name`, `last_name`, `email`
- `company`, `status`, `created_at`, `phone`, `source`
- `updated_at`, `created_date`, `job_title`

**Metadata JSONB:**
- `source` (also exists as direct column)

**Issues:**
- ✅ `phone` - Direct column (correctly referenced)
- ❌ `owner_id` - Referenced in Braid tools but missing

---

### **OPPORTUNITIES**
**Direct Columns:** (12 fields)
- `id`, `tenant_id`, `name`, `stage`, `amount`, `probability`
- `close_date`, `account_id`, `contact_id`
- `created_at`, `updated_at`, `created_date`

**Metadata JSONB:** (empty/null)

**Issues:**
- ❌ `owner_id` - Referenced in Braid tools but missing

---

### **ACTIVITIES**
**Direct Columns:** (17 fields)
- `id`, `tenant_id`, `type`, `subject`, `body`, `related_id`
- `created_at`, `created_date`, `created_by`, `location`, `priority`
- `due_date`, `due_time`, `assigned_to`, `related_to`
- `updated_date`, `status`

**Metadata JSONB:**
- `seed` (test data flag)

**Issues:**
- ✅ `body` - Direct column (correctly referenced)
- ❌ `owner_id` - Referenced in Braid tools but missing (should use `assigned_to` or `created_by`)
- ❌ `related_to_type` - Missing (use `type` or `related_to` instead?)
- ❌ `related_to_id` - Missing (use `related_id` instead)

**Fix Required:** Activities have `related_id` and `related_to` but Braid references `related_to_type` and `related_to_id`

---

## 🔧 Required Fixes

### 1. **AI Snapshot Endpoint** (`backend/routes/ai.js`)
Remove non-existent columns from SELECT queries:

```javascript
// ❌ Current (BROKEN):
.select('id, name, annual_revenue, industry, website, owner_id, metadata')

// ✅ Fixed:
.select('id, name, annual_revenue, industry, website, metadata')
```

```javascript
// ❌ Current (BROKEN):
.select('id, first_name, last_name, email, phone, job_title, account_id')

// ✅ Fixed:
.select('id, first_name, last_name, email, phone, account_id, metadata')
// Note: job_title is in metadata JSONB
```

### 2. **Braid Tool Definitions**
Update `.braid` files to match actual schema:

**accounts.braid:**
- Remove `owner_id` parameter or use alternative field
- Consider adding `created_by` or using tenant-level assignment

**contacts.braid:**
- Replace `owner_id` with `assigned_to` (from metadata)
- Access `job_title` from metadata, not as direct parameter

**leads.braid:**
- Remove `owner_id` parameter or use alternative

**opportunities.braid:**
- Remove `owner_id` parameter or use alternative

**activities.braid:**
- Replace `owner_id` with `assigned_to` or `created_by`
- Replace `related_to_type` + `related_to_id` with existing `related_to` + `related_id`

### 3. **Type Definitions** (`braid-llm-kit/spec/types.braid`)
Update CRM type definitions to match actual schema:

```typescript
type Account = {
  id: String,
  name: String,
  annual_revenue: Number,
  industry: String,
  website: String,
  // owner_id: String,  // ❌ Remove this
  tenant_id: String,
  metadata: JSONB,
  created_at: String,
  updated_at: String
}
```

---

## 📝 Recommendations

1. **Short-term (Immediate):**
   - Fix AI snapshot endpoint to use only existing columns
   - Update Braid tools to remove `owner_id` references
   - Use `assigned_to` from metadata or `created_by` for ownership tracking

2. **Medium-term (Next Sprint):**
   - Add database migration to create `owner_id` columns if needed
   - OR standardize on `assigned_to` (metadata) + `created_by` (direct column)
   - Update all frontend components to use correct field names

3. **Long-term (Architecture):**
   - Decide on ownership model: direct column vs metadata
   - Run comprehensive schema validation before deploys
   - Add runtime schema checks in development mode

---

## ✅ Validation Checks

To prevent future mismatches:

1. **Run before deploy:**
   ```bash
   node backend/check-field-locations.js
   ```

2. **Add to CI/CD:**
   - Schema validation step
   - Compare Braid type definitions against actual DB schema
   - Fail build if mismatches detected

3. **Development guard:**
   - Add runtime check in development mode
   - Log warnings when accessing non-existent columns
   - Suggest metadata path if field exists there
