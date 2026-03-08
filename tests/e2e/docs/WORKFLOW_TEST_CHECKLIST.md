# Complete User Workflow Test - Checklist

## 🎯 Phase 0 Smoke Suite - COMPLETED ✅

**Status:** All 13 API smoke tests passing (1 UI test skipped)
**Execution Time:** 4.7 seconds
**Last Run:** November 17, 2025

### Phase 0 Coverage (see `PHASE0_SMOKE_RESULTS.md`)

- ✅ Authentication & Authorization (unauthenticated API access)
- ✅ AI Assistant Chat (conversation creation, message posting)
- ✅ Calendar Feed (activity array structure)
- ✅ Duplicate Detection (unique & duplicate lead validation)
- ✅ ElevenLabs Integration (tenant agent ID, speech generation)
- ✅ Multi-Tenancy RLS (cross-tenant isolation)
- ✅ Permissions RBAC (roles endpoint, grant placeholder)
- ✅ Stripe Integration (placeholder payment endpoint)
- ✅ Telephony Webhooks (Twilio inbound normalization)

**Run Command:**

```bash
# Quick run
npx playwright test tests/e2e --grep @smoke

# With browser visibility
pwsh tests/e2e/run-phase0-smoke.ps1 -Headed
```

---

## 🎯 Phase 1 Core Flow - COMPLETED ✅

**Status:** All 8 Phase 1 tests passing
**Execution Time:** 18.5 seconds
**Last Run:** November 17, 2025

### Phase 1 Coverage (see `PHASE1_RESULTS.md`)

- ✅ Lead Management (API create, status=new, UI presence, search)
- ✅ Notes (qualification note on Lead, linkage verified)
- ✅ Activities (call/meeting/email creation, completion, UI presence)
- ✅ Lead Conversion (account/contact/opportunity created, lead → converted)
- ✅ Accounts/Opportunities UI (visible and searchable)
- ✅ Opportunity Stages (qualification → proposal → negotiation → closed_won, persisted)
- ✅ Activity Timeline (discovery, demo, proposal, follow-up present)

**Run Command:**

```bash
npx playwright test tests/e2e --grep @phase1
pwsh tests/e2e/run-phase1.ps1 -Headed -Workers 1
```

---

## 📋 Test Coverage Checklist

### ✅ Lead Management

- [x] Create new lead via API
- [x] Verify lead appears in Leads page UI
- [x] Search/filter for lead by email
- [x] Lead status is "new"
- [x] Lead data integrity (name, email, phone, company, title)

### ✅ Notes & Documentation

- [x] Add qualification note to lead
- [ ] Add demo feedback note to opportunity
- [ ] Add negotiation notes to opportunity
- [x] Notes are properly linked to entities
- [ ] Notes appear in UI (if applicable)

### ✅ Activities - Calls

- [x] Create scheduled call activity
- [x] Link call to lead
- [x] Call appears in Activities page
- [x] Complete call (change status to completed)
- [ ] Verify completed call shows in timeline

### ✅ Activities - Meetings

- [x] Create scheduled meeting activity
- [ ] Link meeting to opportunity
- [x] Meeting appears in Activities page
- [x] Complete meeting
- [x] Verify meeting shows in timeline

### ✅ Activities - Emails

- [x] Create email activity
- [ ] Link email to opportunity
- [x] Email appears in Activities page
- [ ] Verify email content/body is stored

### ✅ Lead Conversion

- [x] Convert lead via API
- [x] Conversion creates account
- [x] Conversion creates primary contact
- [x] Conversion creates opportunity
- [ ] All entities properly linked (foreign keys)
- [x] Lead status changes to "converted"
- [ ] Original lead data preserved

### ✅ Account Management

- [x] Account created with correct name
- [x] Account appears in Accounts page UI
- [x] Search/filter for account
- [ ] Account data integrity

### ✅ Contact Management

- [ ] Primary contact created from lead
- [ ] Primary contact linked to account
- [ ] Add second contact to account
- [ ] Both contacts visible for account
- [ ] Contact data integrity (name, email, phone, title)

### ✅ Opportunity Management

- [x] Opportunity created during conversion
- [ ] Opportunity linked to account
- [ ] Opportunity has correct amount ($75,000)
- [ ] Opportunity has close date set
- [x] Opportunity appears in Opportunities page UI
- [x] Search/filter for opportunity

### ✅ Opportunity Stage Progression

- [x] Initial stage: "qualification"
- [x] Move to "proposal" stage
- [x] Move to "negotiation" stage
- [x] Move to "closed_won" stage
- [x] Stage changes persist in database
- [ ] UI reflects current stage

### ✅ Activity Timeline

- [x] Discovery call visible in timeline
- [x] Product demo visible in timeline
- [x] Proposal email visible in timeline
- [x] Follow-up call visible in timeline
- [ ] Activities sorted by date
- [ ] Activities show correct status

### ✅ Data Consistency & Relationships

- [ ] Account exists after conversion
- [ ] Contacts linked to correct account
- [ ] Opportunity linked to correct account
- [ ] Activities linked to correct entities
- [x] Notes linked to correct entities
- [ ] No orphaned records

### ✅ UI Navigation & Display

- [x] Navigate to Leads page successfully
- [x] Navigate to Accounts page successfully
- [x] Navigate to Opportunities page successfully
- [x] Navigate to Activities page successfully
- [ ] Search functionality works on each page
- [ ] Data loads without errors
- [ ] No JavaScript console errors

### ✅ Multi-Entity Workflow

- [x] Lead → Account flow works
- [x] Lead → Contact flow works
- [x] Lead → Opportunity flow works
- [ ] Account → Multiple Contacts works
- [ ] Opportunity → Multiple Activities works
- [ ] Notes work across entity types

---

## 🚫 Gaps to Address (Add New Tests)

### Not Currently Tested:

- [ ] **AI Email Generation** - Generate email content using AI
- [ ] **AI Call Script Generation** - Generate call script using AI
- [ ] **AI Insights/Analytics** - Get AI-powered insights on opportunity
- [ ] **Update existing records** - Edit account/contact/opportunity after creation
- [ ] **Delete operations** - Test deleting activities, notes, contacts
- [ ] **Bulk operations** - Bulk update/delete multiple records
- [ ] **File attachments** - Upload documents to accounts/opportunities
- [ ] **Tags/Labels** - Add tags to records
- [ ] **Email sending** - Actually send email (not just log activity)
- [ ] **Phone integration** - Make actual call via telephony system
- [ ] **Campaign creation** - Create and execute marketing campaign
- [ ] **Lead scoring** - Verify lead scoring calculation
- [ ] **Duplicate detection** - Test duplicate lead/contact detection
- [ ] **Validation rules** - Test required fields and data validation
- [ ] **Permission checks** - Test role-based access control
- [ ] **Audit logs** - Verify audit trail creation
- [ ] **Reports/Dashboards** - Test metrics and dashboard data
- [ ] **Notifications** - Test user notification system
- [ ] **Webhooks** - Test webhook firing on events
- [ ] **Integration sync** - Test external system sync
- [ ] **Data export** - Export records to CSV/Excel
- [ ] **Data import** - Import bulk data from file
- [ ] **Advanced search** - Test complex search queries
- [ ] **Saved filters** - Create and use saved filter views
- [ ] **Custom fields** - Test custom field functionality
- [ ] **Workflows/Automation** - Test automated workflow triggers
- [ ] **Calendar integration** - Sync activities to calendar
- [ ] **Mobile responsiveness** - Test on mobile viewport

---

## 🎯 Priority Gaps to Fill Next

### High Priority:

1. **AI Features** - Email generation, call scripts, insights
2. **Update Operations** - Edit existing records
3. **Validation** - Test required fields and error handling

### Medium Priority:

4. **File Management** - Document uploads and attachments
5. **Phone Integration** - Telephony/calling functionality
6. **Reports** - Dashboard metrics and analytics

### Low Priority:

7. **Bulk Operations** - Mass updates and deletes
8. **Import/Export** - Data migration features
9. **Advanced Features** - Custom fields, workflows, etc.

---

## 📝 Notes

**Current Test File:** `tests/e2e/complete-user-workflow.spec.ts`

**Estimated Run Time:** 3-5 minutes for full workflow

**Data Isolation:** Each run uses unique timestamp-based identifiers

**Cleanup:** Test data remains in database (no automatic cleanup)

**Prerequisites:**

- Backend running on http://localhost:4001
- Frontend running on http://localhost:4000
- SuperAdmin auth already configured
- E2E_TEST_MODE enabled

---

## 🔧 How to Extend This Test

To add new test coverage:

1. **Add to checklist above** - Mark what you want to test
2. **Add helper function** - Create API helper in test file
3. **Add test step** - Insert new step in workflow
4. **Add verification** - Validate data via API and/or UI
5. **Update this checklist** - Check off the item

Example:

```typescript
// Add helper function
async function testAIEmailGeneration(request, opportunityId) {
  const res = await request.post(`${BACKEND_URL}/api/ai/generate-email`, {
    data: {
      tenant_id: E2E_TENANT_ID,
      opportunity_id: opportunityId,
      email_type: 'follow_up',
    },
  });
  return res.json();
}

// Add to workflow
console.log('\n🤖 STEP X: Testing AI email generation...');
const aiEmail = await testAIEmailGeneration(request, opportunityId);
expect(aiEmail.data?.content).toBeTruthy();
console.log('✅ AI email generated successfully');
```
