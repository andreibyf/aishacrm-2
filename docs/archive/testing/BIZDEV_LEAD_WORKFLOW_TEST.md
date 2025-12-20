# BizDev → Lead Promotion Workflow Test Guide

## Test Objective
Verify complete end-to-end flow: Create BizDev Source → Promote to Lead → Verify Lead Creation

## Test Tenants (B2C)
- **Local Development**: `a11dfb63-4b18-4eb8-872e-747af2e37c46`
- **Labor Depot**: `6cb4c008-4847-426a-9a2e-918ad70e7b69`

---

## Test Case 1: B2C BizDev Source Promotion (Local Development)

### Step 1.1: Create B2C BizDev Source
**Location**: Sources page (Local Development tenant selected)

**Expected Form Order (B2C)**:
1. Source Information (with blue highlight)
   - Source Name (required)
   - Batch ID
2. Primary Contact (with blue highlight - **should be FIRST after Source**)
   - Person Name (required)
   - Email (required)
   - Phone Number
3. Address Information
   - Address Line 1, 2
   - City, State, Postal Code, Country

**Test Data**:
```
Source Name: "Test B2C Source - Person First"
Batch ID: "TEST_B2C_001"
Person Name: "Jane Smith" (REQUIRED - should be prominent)
Email: "jane@example.com" (REQUIRED)
Phone: "+1-555-1234"
Address Line 1: "123 Main St"
City: "San Francisco"
State/Province: "CA"
Postal Code: "San Francisco"
Country: "United States"
```
    
**Verify**:
- [x] Form displays "CLIENT TYPE: B2C" in header
- [x] Primary Contact section appears BEFORE address fields
- [x] Person Name field is marked as required (red asterisk)
- [x] Email field is marked as required (red asterisk)
- [ ] Blue highlight box around contact section
- [x] Source creates successfully → appears in list

---

### Step 1.2: Verify BizDev Source Appears in List
**Expected Display**:
- Status badge: "Active"
- Shows either `contact_person` (Jane Smith) or `company_name` as primary identifier
- Source count increments

**Verify**:
- [x] Source appears in list with correct status
- [x] Display shows person name prominently (not company)
- [x] Stats show: 1 Active source

---

### Step 1.3: Promote B2C Source to Lead
**Location**: Click on source → Detail panel → "Promote to Lead" button

**Expected Dialogs** (in order):
1. Browser confirm: "Are you sure you want to promote 'Jane Smith' to a Lead?"
2. Alert in detail panel: "Promote to Lead?"
   - Message: "This will create a Lead from **Jane Smith**"
   - Buttons: "Confirm Promotion" (green) / "Cancel"

**Test Action**:
- [x] Click "Promote to Lead" button
- [x] Verify confirm dialog shows person name (not "null")
- [x] Verify alert description mentions Lead creation (not Account)
- [x] Click "Confirm Promotion"

**Expected Result**:
- Toast success: "BizDev source promoted to lead"
- Description: "Created lead from: Jane Smith"
- Detail panel closes
- BizDev source status changes to "Promoted"
- Stats update (Active: 0, Promoted: 1)

**Verify**:
- [x] Toast appears with correct message
- [x] Source status changed to "Promoted" immediately
- [x] Stats reflect change instantly

---

### Step 1.4: Verify Lead Was Created (Navigate to Leads Page)
**Location**: Leads page (Local Development tenant)

**Expected Lead Data**:
```
First Name: "Jane"
Last Name: "Smith"
Email: "jane@example.com"
Phone: "+1-555-1234"
Company: [B2C Placeholder Account Name]
Source: [auto-populated from BizDev Source]
Address: "123 Main St, San Francisco, CA 94105, United States"
Lead Type: "B2C" (in metadata)
```

**Test Steps**:
1. Navigate to Leads page
2. Search for "Jane Smith"
3. Verify lead appears in list
4. Click to view detail panel

**Verify**:
- [x] Lead appears in list immediately
- [x] First Name: "Jane"
- [x] Last Name: "Smith"
- [x] Email: "jane@example.com"
- [x] Phone: "+1-555-1234"
- [x] Address populated correctly
- [x] Lead Type shows "B2C" (check metadata)
- [x] Lead status is "New" (default)
- [x] Metadata shows: `promoted_from_bizdev_source_id`, `promoted_at` timestamp

---

## Test Case 2: B2C BizDev Source - Labor Depot Tenant

**Purpose**: Test consistency across different B2C tenant

**Repeat Steps 1.1-1.4** with Labor Depot tenant:
- Select "Labor Depot" from tenant dropdown
- Use different test data (e.g., "John Doe" instead of "Jane Smith")

**Additional Verify**:
- [ ] Form reorders for B2C in Labor Depot too
- [ ] Lead creates in correct tenant (not mixed up)
- [ ] Promotion workflow consistent

---

## Test Case 3: B2B BizDev Source (Comparison)

**Purpose**: Verify B2B workflow is different from B2C

### Step 3.1: Create B2B BizDev Source
**Location**: Sources page (select a B2B tenant if available, or create test data)

**Expected Form Order (B2B)**:
1. Source Information
   - Source Name
   - Batch ID
2. Company Information (with amber highlight - **should be FIRST after Source**)
   - Company Name (required)
   - DBA Name
   - Industry
   - Website
3. Company Contact (optional)
   - Contact Person
   - Email
   - Phone

**Test Data**:
```
Source Name: "Test B2B Source - Company First"
Company Name: "Acme Corp" (REQUIRED - should be prominent)
DBA Name: "Acme Industries"
Industry: "Manufacturing"
Website: "https://acme.example.com"
Contact Person: "Bob Johnson" (OPTIONAL)
Email: "bob@acme.com" (OPTIONAL)
Phone: "+1-555-5678"
```

**Verify**:
- [x] Form displays "CLIENT TYPE: B2B" in header
- [x] Company Information section appears FIRST (before contact)
- [x] Company Name field is marked as required
- [x] Contact Person is marked as optional
- [x] Amber highlight box around company section
- [x] Source creates successfully

---

### Step 3.2: Promote B2B Source to Lead
**Follow same steps as 1.3**

**Expected Result**:
- Confirm dialog: "Are you sure you want to promote 'Acme Corp' to a Lead?"
- Alert: "This will create a Lead from **Acme Corp**"
- Lead created with `company_name` field populated

**Verify**:
- [x] Company name appears in confirm dialog (not person)
- [x] Lead creates successfully
- [x] Lead has company field populated
- [x] Lead Type shows "B2B" (in metadata)

---

## Test Case 4: Edge Cases & Error Handling

### Step 4.1: Promote with Missing Data
**Test**: Promote BizDev source with minimal data (only required fields)

**Scenario 1 - B2C minimum**:
- Person Name: "Test Person"
- Email: "test@example.com"
- Everything else blank

**Scenario 2 - B2B minimum**:
- Company Name: "Test Company"
- Everything else blank

**Verify**:
- [ ] Promotion succeeds even with minimal data
- [ ] Lead creates with available data
- [ ] No null pointer errors
- [ ] Toast shows success

---

### Step 4.2: Null Company Name Handling
**Test**: Promote B2C source with no company name

**Expected**: 
- Confirm dialog should NOT show "null"
- Should fallback to contact_person or "this prospect"

**Verify**:
- [x] Dialog shows meaningful name (not "null")
- [x] Toast shows proper name

---

## Test Case 5: UI State Verification

### Step 5.1: Immediate Visual Feedback
**After promotion, verify**:
- [ ] BizDev source status changes to "Promoted" immediately
- [ ] Stats update without page refresh
- [ ] Detail panel closes automatically
- [ ] Toast appears with success message
- [ ] Can navigate to Leads page and see new lead

### Step 5.2: Cache Invalidation
**Verify caches are properly cleared**:
- [ ] Refresh BizDev Sources page → source still shows as Promoted
- [ ] Refresh Leads page → new lead still appears
- [ ] No stale data returned

---

## Debugging Checklist

If any test fails, check:

1. **Browser Console** (F12)
   - Any JavaScript errors?
   - Check network tab for failed API calls
   - Look for "[BizDevSource.promote]" logs

2. **Backend Logs**
   ```bash
   docker logs aishacrm-backend -f
   ```
   - Search for "[Promote" logs
   - Check for "Lead created" message
   - Look for any errors

3. **Database** (Optional - for verification)
   ```sql
   -- Check promoted BizDev source
   SELECT id, company_name, contact_person, status, metadata 
   FROM bizdev_sources 
   WHERE status = 'Promoted' 
   LIMIT 5;

   -- Check newly created leads
   SELECT id, first_name, last_name, company, email, lead_type, metadata
   FROM leads 
   WHERE created_date > NOW() - INTERVAL '1 hour'
   LIMIT 5;
   ```

4. **Form Issues**
   - Check tenant selection (should match test tenant ID)
   - Verify business_model setting in Tenant table
   - Ensure localStorage doesn't cache old tenant settings

---

## Success Criteria

✅ **All tests pass when:**
1. B2C form shows Person Name first (blue highlight)
2. B2B form shows Company Name first (amber highlight)
3. BizDev sources promote to Leads (not Accounts)
4. Confirm dialogs show meaningful names (not null)
5. Leads appear immediately in Leads page after promotion
6. All data from BizDev source properly transfers to Lead
7. B2C and B2B workflows are visibly different but both work

---

## Notes

- Tests should be run on **both B2C test tenants** (Local Development & Labor Depot)
- If B2B tenant available, include Test Case 3 for comparison
- Record any issues found and create separate bug reports
- Take screenshots of form layouts for documentation
