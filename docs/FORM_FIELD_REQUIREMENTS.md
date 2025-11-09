# Form Field Requirements Analysis

**Last Updated:** November 9, 2025  
**Generated After:** CashFlow form fix (transaction_type → type mapping)

## Critical Issue Fixed: CashFlow Form

### Problem
The CashFlow form was sending `transaction_type` but the backend API expects `type`.

### Fix Applied
Added field mapping in `CashFlowForm.jsx`:
```javascript
const transactionData = {
  ...formData,
  type: formData.transaction_type, // Backend expects 'type' not 'transaction_type'
  amount: parseFloat(formData.amount),
  tenant_id: tenantFilter.tenant_id,
  entry_method: "manual"
};
delete transactionData.transaction_type;
```

## Database Schema Requirements by Entity

### 1. Cash Flow (`cash_flow` table)

**Backend Route:** `/api/cashflow` (POST, PUT)  
**Validation:** `backend/routes/cashflow.js` line 62

**REQUIRED Fields:**
- ✅ `tenant_id` - Auto-populated from context
- ✅ `amount` - Number input, marked required in form
- ✅ `type` - Mapped from `transaction_type` dropdown
- ✅ `transaction_date` - Date input, marked required in form

**Optional Fields:**
- `category` - Dropdown (income/expense categories)
- `description` - Text input, marked required in form
- `account_id` - Optional (not used in form)
- `metadata` - JSONB (not used in form)

**Form-Only Fields (not in DB):**
- `transaction_type` → maps to `type`
- `vendor_client` → stored in metadata or description
- `payment_method` → stored in metadata
- `notes` → stored in metadata or description
- `recurrence_pattern`, `status`, `tags`, `tax_category`, `related_account_id`, `related_opportunity_id` → not currently mapped

### 2. Accounts (`accounts` table)

**Backend Route:** `/api/accounts` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated
- ✅ `name` - **MUST be marked required in form**

**Common Optional Fields:**
- `account_type`, `industry`, `company_size`, `revenue`, `website`
- `phone`, `email`, `address`, `city`, `state`, `zip`, `country`
- `description`, `status`, `lead_source`, `assigned_to`
- `metadata`, `tags`, `is_test_data`

**Form Field Mapping Notes:**
- Form may use `annual_revenue` → maps to `revenue`
- Form may use `employee_count` → maps to `company_size`
- Form may use `type` → maps to `account_type`
- Form may use `address_1`, `address_2` → combine into `address`

### 3. Leads (`leads` table)

**Backend Route:** `/api/leads` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated

**Common Optional Fields:**
- `first_name`, `last_name`, `email`, `phone`, `company`
- `title` (note: form may use `job_title`)
- `lead_source`, `status`, `rating`, `industry`
- `estimated_value`, `notes`, `assigned_to`
- `is_test_data`, `tags`, `metadata`

**Form Field Mapping Notes:**
- Form may use `job_title` → maps to `title`
- Form may use `source` → maps to `lead_source`
- Form may use `address_1`, `address_2`, `city`, `state`, `zip`, `country` → combine or store in metadata

### 4. Opportunities (`opportunities` table)

**Backend Route:** `/api/opportunities` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated
- ✅ `name` - **MUST be marked required**

**Common Optional Fields:**
- `account_id`, `amount`, `close_date`, `stage`, `probability`
- `type`, `lead_source`, `description`, `next_step`
- `assigned_to`, `contact_id`, `is_test_data`
- `metadata`, `tags`, `custom_fields`

### 5. Contacts (`contacts` table)

**Backend Route:** `/api/contacts` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated

**Common Optional Fields:**
- `first_name`, `last_name`, `email`, `phone`, `mobile`
- `title` (note: form may use `job_title`)
- `department`, `account_id`, `status`
- `mailing_address`, `mailing_city`, `mailing_state`, `mailing_zip`, `mailing_country`
- `is_test_data`, `metadata`, `tags`

**Form Field Mapping Notes:**
- Form may use `job_title` → maps to `title`
- Form may use `address_1`, `address_2` → map to `mailing_address`
- Form may use `assigned_to` → may need to map to `owner_id`

### 6. Activities (`activities` table)

**Backend Route:** `/api/activities` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated
- ✅ `subject` - **MUST be marked required**
- ✅ `activity_type` - **MUST be marked required**

**Common Optional Fields:**
- `related_to_type`, `related_to_id`, `status`, `priority`
- `due_date`, `start_date`, `end_date`, `description`
- `assigned_to`, `completed_date`, `duration_minutes`
- `location`, `outcome`, `is_test_data`, `metadata`, `tags`

### 7. Employees (`employees` table)

**Backend Route:** `/api/employees` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated
- ✅ `email` - **MUST be marked required**

**Common Optional Fields:**
- `first_name`, `last_name`, `phone`, `mobile`
- `department`, `title`, `employee_role`
- `hire_date`, `manager_id`, `status`
- `notes`, `user_id`, `is_test_data`, `metadata`

**Form Field Notes:**
- Form may include `has-crm-access` → custom field, not in DB schema

### 8. BizDev Sources (`bizdev_sources` table)

**Backend Route:** `/api/bizdevsources` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated
- ✅ `name` - **MUST be marked required**
- ✅ `source_type` - **MUST be marked required**

**Common Optional Fields:**
- `url`, `description`, `status`, `priority`
- `tags`, `last_checked`, `check_frequency_days`
- `assigned_to`, `notes`, `is_test_data`, `metadata`

**Form Field Mapping Notes:**
- Form may use `source` → maps to `source_type`
- Additional fields like `company_name`, `dba_name`, `industry`, etc. → store in `metadata`
- Fields like `batch_id`, `lead_ids`, `license_status` → store in `metadata`

### 9. Webhooks (`webhooks` table)

**Backend Route:** `/api/webhooks` (POST, PUT)  
**Required Fields:**
- ✅ `tenant_id` - Auto-populated
- ✅ `url` - **MUST be marked required**
- ✅ `event_type` - **MUST be marked required**

**Common Optional Fields:**
- `name`, `description`, `is_active`
- `secret`, `headers`, `retry_config`, `metadata`

**Form Field Mapping Notes:**
- Form may use `target_url` → maps to `url`
- Form may use `event_name` → maps to `event_type`

## Action Items for Form Fixes

### High Priority (Preventing Save Errors)

1. ✅ **CashFlowForm.jsx** - FIXED
   - Added mapping: `transaction_type` → `type`
   - Required fields properly marked

2. **AccountForm.jsx**
   - Add `required` attribute to `name` field
   - Map `annual_revenue` → `revenue`
   - Map `employee_count` → `company_size`
   - Map `type` → `account_type`
   - Combine `address_1` + `address_2` → `address`

3. **LeadForm.jsx**
   - Map `job_title` → `title`
   - Map `source` → `lead_source`

4. **ContactForm.jsx**
   - Map `job_title` → `title`
   - Map `address_1` → `mailing_address`

5. **ActivityForm.jsx**
   - Verify `subject` and `activity_type` are marked required

6. **EmployeeForm.jsx**
   - Verify `email` is marked required

7. **BizDevSourceForm.jsx**
   - Verify `name` and `source_type` are marked required
   - Map `source` → `source_type` if needed
   - Move extra fields to `metadata`

8. **WebhookForm.jsx**
   - Map `target_url` → `url`
   - Map `event_name` → `event_type`
   - Verify both are marked required

### Medium Priority (Data Consistency)

- Ensure all forms properly populate `tenant_id` from context
- Ensure forms that use `is_test_data` toggle properly set the field
- Validate that optional fields are correctly handled (can be null/empty)

### Low Priority (Nice to Have)

- Add validation for email fields (proper email format)
- Add validation for phone fields (proper phone format)
- Add validation for URL fields (proper URL format)
- Add validation for date fields (no future dates where inappropriate)

## Testing Checklist

For each form, test:
- [ ] Can save with only required fields
- [ ] Can save with all fields populated
- [ ] Required fields show validation errors when empty
- [ ] Data saves to correct database columns
- [ ] Field mappings work correctly (e.g., `transaction_type` → `type`)
- [ ] `tenant_id` is automatically populated from context
- [ ] Forms work for all user roles (superadmin, admin, manager, employee)

## Backend API Validation Patterns

Most backend routes follow this pattern:
```javascript
router.post('/', async (req, res) => {
  const data = req.body;
  if (!data.tenant_id || !data.required_field) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'tenant_id and required_field are required' 
    });
  }
  // ... save to database
});
```

Check these files for exact validation:
- `backend/routes/cashflow.js` - line 62
- `backend/routes/accounts.js`
- `backend/routes/leads.js`
- `backend/routes/opportunities.js`
- `backend/routes/contacts.js`
- `backend/routes/activities.js`
- `backend/routes/employees.js`
- `backend/routes/bizdevsources.js`
- `backend/routes/webhooks.js`
