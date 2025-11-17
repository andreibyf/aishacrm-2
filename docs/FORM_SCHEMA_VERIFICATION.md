# Form Schema Verification Report

Generated: 2025-11-09T22:20:28.783Z

## Summary

| Form Component | Database Table | Status | Issues |
|---------------|----------------|--------|--------|
| AccountForm.jsx | accounts | ⚠️ Issues | 13 |
| LeadForm.jsx | leads | ⚠️ Issues | 25 |
| undefined | - | ❌ Error | Form file not found: C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53\src\components\opportunitys\OpportunityForm.jsx |
| ContactForm.jsx | contacts | ⚠️ Issues | 15 |
| undefined | - | ❌ Error | Form file not found: C:\Users\andre\Documents\GitHub\ai-sha-crm-copy-c872be53\src\components\activitys\ActivityForm.jsx |
| CashFlowForm.jsx | cash_flow | ⚠️ Issues | 8 |
| EmployeeForm.jsx | employees | ⚠️ Issues | 9 |
| BizDevSourceForm.jsx | bizdev_sources | ⚠️ Issues | 23 |
| WebhookForm.jsx | webhooks | ⚠️ Issues | 5 |

## Detailed Analysis

### AccountForm.jsx

**Database Table:** `accounts`

**Form Fields:** 24 | **DB Required:** 2 | **DB Optional:** 28

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`

#### ⚠️ Should Be Marked Required

These fields are required in the database but not marked as required in the form:

- `name`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `annual_revenue`
- `employee_count`
- `type`
- `address_1`
- `address_2`

#### Database Schema

**Required Fields:**
- `tenant_id`
- `name`

**Optional Fields:**
- `account_type`
- `industry`
- `company_size`
- `revenue`
- `website`
- `phone`
- `email`
- `address`
- `city`
- `state`
- `zip`
- `country`
- `description`
- `status`
- `lead_source`
- `owner_id`
- `assigned_to`
- `parent_account_id`
- `account_health`
- `health_score`
- `health_reason`
- `last_contact_date`
- `next_follow_up`
- `tags`
- `custom_fields`
- `metadata`
- `is_test_data`
- `notes`

---

### LeadForm.jsx

**Database Table:** `leads`

**Form Fields:** 34 | **DB Required:** 1 | **DB Optional:** 21

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `job_title`
- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `mt-1 bg-slate-600 border-slate-500 text-slate-300 cursor-not-allowed`
- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `score`
- `score_reason`
- `do_not_call`
- `do_not_text`
- `account_id`
- `source`
- `address_1`
- `address_2`
- `city`
- `state`
- `zip`
- `country`

#### Database Schema

**Required Fields:**
- `tenant_id`

**Optional Fields:**
- `first_name`
- `last_name`
- `email`
- `phone`
- `company`
- `title`
- `lead_source`
- `status`
- `rating`
- `industry`
- `estimated_value`
- `notes`
- `assigned_to`
- `next_follow_up`
- `last_contact_date`
- `converted_to_opportunity`
- `converted_date`
- `lost_reason`
- `tags`
- `metadata`
- `is_test_data`

---

### ContactForm.jsx

**Database Table:** `contacts`

**Form Fields:** 25 | **DB Required:** 1 | **DB Optional:** 33

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `job_title`
- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `mt-1 bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200 hover:bg-slate-700`
- `address_1`
- `address_2`
- `city`
- `state`
- `zip`
- `country`
- `assigned_to`

#### Database Schema

**Required Fields:**
- `tenant_id`

**Optional Fields:**
- `first_name`
- `last_name`
- `email`
- `phone`
- `mobile`
- `title`
- `department`
- `account_id`
- `lead_source`
- `status`
- `owner_id`
- `assistant`
- `assistant_phone`
- `birthdate`
- `description`
- `do_not_call`
- `email_opt_out`
- `reports_to`
- `mailing_address`
- `mailing_city`
- `mailing_state`
- `mailing_zip`
- `mailing_country`
- `other_address`
- `other_city`
- `other_state`
- `other_zip`
- `other_country`
- `last_contact_date`
- `next_follow_up`
- `tags`
- `metadata`
- `is_test_data`

---

### CashFlowForm.jsx

**Database Table:** `cash_flow`

**Form Fields:** 8 | **DB Required:** 4 | **DB Optional:** 4

> **Note:** Frontend uses "transaction_type" but backend expects "type"

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`
- `type`

#### ⚠️ Should Be Marked Required

These fields are required in the database but not marked as required in the form:

- `transaction_date`
- `amount`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `transaction_type`
- `vendor_client`
- `payment_method`
- `notes`

#### Database Schema

**Required Fields:**
- `tenant_id`
- `transaction_date`
- `amount`
- `type`

**Optional Fields:**
- `category`
- `description`
- `account_id`
- `metadata`

---

### EmployeeForm.jsx

**Database Table:** `employees`

**Form Fields:** 7 | **DB Required:** 2 | **DB Optional:** 14

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`
- `email`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `bg-slate-900 border-slate-700 text-slate-100`
- `bg-slate-900 border-slate-700 text-slate-100`
- `has-crm-access`
- `bg-slate-700 border-slate-600 text-slate-200`
- `bg-slate-800 border-slate-700`
- `text-slate-200`
- `text-slate-200`

#### Database Schema

**Required Fields:**
- `tenant_id`
- `email`

**Optional Fields:**
- `first_name`
- `last_name`
- `phone`
- `mobile`
- `department`
- `title`
- `employee_role`
- `hire_date`
- `manager_id`
- `status`
- `notes`
- `user_id`
- `metadata`
- `is_test_data`

---

### BizDevSourceForm.jsx

**Database Table:** `bizdev_sources`

**Form Fields:** 22 | **DB Required:** 3 | **DB Optional:** 11

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`
- `name`
- `source_type`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `source`
- `batch_id`
- `company_name`
- `dba_name`
- `industry`
- `website`
- `email`
- `phone_number`
- `address_line_1`
- `address_line_2`
- `city`
- `state_province`
- `postal_code`
- `country`
- `industry_license`
- `bg-slate-700 border-slate-600 text-slate-100`
- `license_expiry_date`
- `bg-slate-700 border-slate-600 text-slate-100`
- `lead_ids`
- `license_status`

#### Database Schema

**Required Fields:**
- `tenant_id`
- `name`
- `source_type`

**Optional Fields:**
- `url`
- `description`
- `status`
- `priority`
- `tags`
- `last_checked`
- `check_frequency_days`
- `assigned_to`
- `notes`
- `metadata`
- `is_test_data`

---

### WebhookForm.jsx

**Database Table:** `webhooks`

**Form Fields:** 4 | **DB Required:** 3 | **DB Optional:** 7

#### ❌ Missing Required Fields

These fields are required in the database but missing from the form:

- `tenant_id`
- `url`
- `event_type`

#### ℹ️ Extra Fields

These fields exist in the form but not in the database schema:

- `target_url`
- `event_name`

#### Database Schema

**Required Fields:**
- `tenant_id`
- `url`
- `event_type`

**Optional Fields:**
- `name`
- `description`
- `is_active`
- `secret`
- `headers`
- `retry_config`
- `metadata`

---

