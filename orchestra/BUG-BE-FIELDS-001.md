# BUG-BE-FIELDS-001 – Field Parity Mapping

_Last updated: 2025-12-01_

Objective: document the exact gap between **frontend entity forms**, **backend routes**, and the **current Supabase schema snapshot** so we can scope BUG-BE-FIELDS-002 fixes accurately.

Sources inspected
- UI forms and helpers under `src/components` (LeadForm, ContactForm, AccountForm, OpportunityForm, ActivityForm).
- Backend REST routes under `backend/routes/*.js`.
- Supabase schema snapshot `supabase/migrations/20251029233356_remote_schema.sql` + recent flatten migrations (e.g., `backend/migrations/APPLY_ACCOUNTS_FLATTEN.sql`).

## TL;DR
- Every entity form exposes significantly more fields than we persist as first-class columns.
- Backend routes frequently dump “extra” fields into the `metadata` JSONB column (`expandMetadata` later flattens the object). That keeps the data, but:
  - Columns that **do not exist** in `SELECT` lists (e.g., `assigned_to` for leads) can’t be filtered or indexed server-side.
  - Some fields never make it into the metadata map because the route destructures them away (e.g., `score`, `score_reason`, address blocks in `LeadForm`).
  - Schema snapshot confirms many columns (addresses, DNC flags, AI configs) simply don’t exist; we rely entirely on JSONB, which is why round-trips feel unreliable.
- Activities are the worst case: the table lacks `status`, `duration`, `outcome`, `ai_call_config`, etc., so everything is pulled from metadata, making filtering impossible and causing blank values when metadata was never set (common in legacy rows).

## Entity-by-Entity Mapping

### Leads (`src/components/leads/LeadForm.jsx`, `backend/routes/leads.js`)

| Layer | Fields observed |
| --- | --- |
| **UI form** | `first_name`, `last_name`, `email`, `phone`, `do_not_call`, `do_not_text`, `company`, `account_id`, `job_title`, `source`, `status`, `score`, `score_reason`, `estimated_value`, `address_1`, `address_2`, `city`, `state`, `zip`, `country`, `tags`, `assigned_to`, `is_test_data`, `unique_id`, `tenant_id`.
| **Backend route** | Accepts `first_name`, `last_name`, `email`, `phone`, `company`, `job_title`, `status`, `source`, `is_test_data` as columns. Everything else is captured via `const { ...metadata, ...otherFields }` then stuffed into `metadata` before insert/update, finally spread back out via `expandMetadata`.
| **Supabase columns** | Only `first_name`, `last_name`, `email`, `company`, `status`, `metadata`, `phone`, `source`, `job_title`, timestamps (no address fields, no score, no assignment column, no DNC flags, no tags). |

**Gaps / Risks**
1. Address, score, assignment, tag, DNC, and custom ID fields are JSON-only → can’t be filtered/indexed and have been observed missing on GET when metadata omitted.
2. `score` / `score_reason` never destructured, so they _do_ live in metadata, but the list endpoint can’t order/filter on them.
3. `unique_id` is generated client-side but never stored in a dedicated column; metadata lookup is brittle for automation.

**Proposed actions for BUG-BE-FIELDS-002+**
- Add real columns for `assigned_to`, `score`, `score_reason`, `estimated_value`, `do_not_call`, `do_not_text`, and address block.
- Ensure routes explicitly map boolean fields to columns to avoid metadata drift.

### Contacts (`src/components/contacts/ContactForm.jsx`, `backend/routes/contacts.js`)

| Layer | Fields observed |
| --- | --- |
| **UI form** | `first_name`, `last_name`, `email`, `phone`, `mobile`, `job_title`, `department`, `account_id`, `assigned_to`, `lead_source`, `status`, `address_1/2`, `city`, `state`, `zip`, `country`, `tags`, `is_test_data`.
| **Backend route** | Handles `first_name`, `last_name`, `email`, `phone`, `account_id`, `status` as columns; anything else (mobile, addresses, tags, assigned_to, dept, job title, lead source) lands in `metadata` via `otherFields`.
| **Supabase columns** | `first_name`, `last_name`, `email`, `phone`, `account_id`, `status`, `metadata`, timestamps. No `mobile`, `job_title`, `department`, `assigned_to`, address, tags, or `is_test_data` column (only JSON).

**Gaps / Risks**
1. Assignment and address info are metadata-only → impossible to query server-side and easy to drop when records were created before metadata flattening.
2. `mobile` vs `phone` distinction is lost; UI treats them separately.
3. Lead source field is written to metadata but not exposed in list filters.

**Suggested fixes**
- Extend schema with `mobile`, `job_title`, `department`, `assigned_to`, and address columns (similar to accounts flattening).
- Teach routes/tests to persist boolean `is_test_data` and tags in deterministic columns or a normalized tag table.

### Accounts (`src/components/accounts/AccountForm.jsx`, `backend/routes/accounts.js`)

| Layer | Fields observed |
| --- | --- |
| **UI form** | `name`, `assigned_to`, `type`, `industry`, `website`, `phone`, `email`, `annual_revenue`, `employee_count`, full address block, `description`, `tags`, `is_test_data`.
| **Backend route** | After recent refactor, route explicitly handles `phone`, `email`, `annual_revenue`, `employee_count`, address fields, `assigned_to` plus metadata for leftovers (e.g., `description`).
| **Schema snapshot** | Old snapshot (2025-10) shows only `name`, `industry`, `website`, `type`, `annual_revenue`, metadata. No phone/email/address/assigned_to columns despite code expecting them (hence previous data loss). Flatten migration `backend/migrations/APPLY_ACCOUNTS_FLATTEN.sql` adds them, but prod schema must be verified.

**Gaps / Risks**
1. If flatten migration hasn’t run everywhere, data sent for `phone/email/address/assigned_to` silently disappears (column missing ⇒ insert fails unless JSON fallback is added).
2. `description`, `tags`, `is_test_data` remain metadata-only.

**Action items**
- Confirm Supabase has the flattened columns (run APPLY_ACCOUNTS_FLATTEN in dev/prod). Until then, `phone/email/...` are not persisted.
- Decide whether `description` should get its own column or stay JSON-only (UI treats it as primary field).

### Opportunities (`src/components/opportunities/OpportunityForm.jsx`, `backend/routes/opportunities.js`)

| Layer | Fields observed |
| --- | --- |
| **UI form** | `name`, `account_id`, `contact_id`, `lead_id`, `assigned_to`, `stage`, `amount`, `close_date`, `lead_source`, `type`, `description`, `next_step`, `competitor`, `tags`, `is_test_data`.
| **Backend route** | Columns: `name`, `account_id`, `contact_id`, `amount`, `stage`, `probability`, `close_date`. Everything else (lead linkage, assignment, description, next step, competitor, tags, lead_source, type) written into metadata.
| **Schema** | Mirror of backend: no `assigned_to`, `lead_id`, `type`, `lead_source`, `next_step`, `competitor`, or tag columns.

**Gaps / Risks**
- UI can select `assigned_to` and `lead_id`, but backend never returns column values because they live only inside metadata. Filtering by owner or lead is impossible server-side.
- `probability` isn’t surfaced in the UI but exists in DB; `lead_source/type` only exist in metadata ⇒ analytics lose sight.

**Suggested fixes**
- Promote `assigned_to`, `lead_id`, `lead_source`, `type`, `next_step`, `competitor` to columns; update routes/tests accordingly.
- Introduce proper tag relationship or text[] column if tags must remain inline.

### Activities (`src/components/activities/ActivityForm.jsx`, `backend/routes/activities.js`)

| Layer | Fields observed |
| --- | --- |
| **UI form** | `type`, `subject`, `due_date`, `due_time`, `duration`, `description/body`, `status`, `priority`, `assigned_to`, `related_to`, `related_id`, `outcome`, `location`, `is_test_data`, `tenant_id`, `ai_call_config.*`, `ai_email_config.*`, `notes`.
| **Backend route** | Explicit columns: `type`, `subject`, `body`, `related_id`, `status`, `due_date`, `due_time`, `assigned_to`, `priority`, `location`, `created_by`, `related_to`. Everything else sits in `metadata` (duration, outcome, tags, AI configs, is_test_data, etc.). When returning results, `normalizeActivity` merges metadata into the response but only after a GET; list filtering still runs against raw table columns.
| **Schema** | Table has `type`, `subject`, `body`, `related_id`, `metadata`, `created_at`, `created_by`, `location`, `priority`, `due_date`, `due_time`, `assigned_to`, `related_to`, `updated_date`. **There is no `status`, `duration`, `outcome`, `tags`, `ai_call_config`, or `is_test_data` column.**

**Gaps / Risks**
1. `status` appears to be stored in row metadata for older inserts even though the route now attempts to set `status` column—schema snapshot shows no `status` column, so writes currently fail silently (Supabase ignores unknown column) or break.
2. Advanced AI fields (call/email configs) only live in JSON; we can’t query pending AI calls or emails by provider/tenant.
3. Caches/builders rely on metadata keys like `assigned_to`, leading to inconsistent filtering (route tries to filter on metadata via client-side JS, expensive).

**Recommended follow-up**
- Add missing columns: `status`, `duration`, `outcome`, `is_test_data`. Consider JSONB columns for AI configs but ensure they’re first-class keys rather than buried inside metadata.
- Rework list endpoint to filter via SQL (requires real columns for fields we filter on).

## Cross-Cutting Observations
1. **Metadata overuse** – Most gaps are from relying on `metadata` to store structured data. That causes:
   - Lossy migrations (old rows missing keys → blank UI fields on GET).
   - Non-indexed queries; the API can’t sort/filter by those fields.
   - Hard-to-test DTOs; TypeScript definitions expect columns that the DB doesn’t have.
2. **Schema drift** – Backend already assumes flattened columns for accounts/leads/opportunities, but Supabase snapshot (and prod) may not. Running migrations (`APPLY_ACCOUNTS_FLATTEN.sql`, `014_flatten_leads.sql`, etc.) is mandatory before BUG-BE-FIELDS-002.
3. **Testing gap** – No regression tests assert that round-tripped entities retain optional fields. BUG-BE-FIELDS-003 should add API tests per entity to cover the fields listed above.

## Next Steps
- Validate which flatten migrations have been applied in each environment; document any pending changes.
- For BUG-BE-FIELDS-002, prioritize adding proper columns for fields the UI edits every day (assignment, status, addresses, DNC flags, AI configs) and update backend routes accordingly.
- Implement regression tests (BUG-BE-FIELDS-003) that populate every UI field, persist, and fetch to confirm parity.
