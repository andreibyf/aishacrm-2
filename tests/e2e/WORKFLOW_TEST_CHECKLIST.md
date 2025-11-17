# Complete User Workflow Test - Checklist

## 📋 Test Coverage Checklist

### ✅ Lead Management
- [ ] Create new lead via API
- [ ] Verify lead appears in Leads page UI
- [ ] Search/filter for lead by email
- [ ] Lead status is "new"
- [ ] Lead data integrity (name, email, phone, company, title)

### ✅ Notes & Documentation
- [ ] Add qualification note to lead
- [ ] Add demo feedback note to opportunity
- [ ] Add negotiation notes to opportunity
- [ ] Notes are properly linked to entities
- [ ] Notes appear in UI (if applicable)

### ✅ Activities - Calls
- [ ] Create scheduled call activity
- [ ] Link call to lead
- [ ] Call appears in Activities page
- [ ] Complete call (change status to completed)
- [ ] Verify completed call shows in timeline

### ✅ Activities - Meetings
- [ ] Create scheduled meeting activity
- [ ] Link meeting to opportunity
- [ ] Meeting appears in Activities page
- [ ] Complete meeting
- [ ] Verify meeting shows in timeline

### ✅ Activities - Emails
- [ ] Create email activity
- [ ] Link email to opportunity
- [ ] Email appears in Activities page
- [ ] Verify email content/body is stored

### ✅ Lead Conversion
- [ ] Convert lead via API
- [ ] Conversion creates account
- [ ] Conversion creates primary contact
- [ ] Conversion creates opportunity
- [ ] All entities properly linked (foreign keys)
- [ ] Lead status changes to "converted"
- [ ] Original lead data preserved

### ✅ Account Management
- [ ] Account created with correct name
- [ ] Account appears in Accounts page UI
- [ ] Search/filter for account
- [ ] Account data integrity

### ✅ Contact Management
- [ ] Primary contact created from lead
- [ ] Primary contact linked to account
- [ ] Add second contact to account
- [ ] Both contacts visible for account
- [ ] Contact data integrity (name, email, phone, title)

### ✅ Opportunity Management
- [ ] Opportunity created during conversion
- [ ] Opportunity linked to account
- [ ] Opportunity has correct amount ($75,000)
- [ ] Opportunity has close date set
- [ ] Opportunity appears in Opportunities page UI
- [ ] Search/filter for opportunity

### ✅ Opportunity Stage Progression
- [ ] Initial stage: "qualification"
- [ ] Move to "proposal" stage
- [ ] Move to "negotiation" stage
- [ ] Move to "closed_won" stage
- [ ] Stage changes persist in database
- [ ] UI reflects current stage

### ✅ Activity Timeline
- [ ] Discovery call visible in timeline
- [ ] Product demo visible in timeline
- [ ] Proposal email visible in timeline
- [ ] Follow-up call visible in timeline
- [ ] Activities sorted by date
- [ ] Activities show correct status

### ✅ Data Consistency & Relationships
- [ ] Account exists after conversion
- [ ] Contacts linked to correct account
- [ ] Opportunity linked to correct account
- [ ] Activities linked to correct entities
- [ ] Notes linked to correct entities
- [ ] No orphaned records

### ✅ UI Navigation & Display
- [ ] Navigate to Leads page successfully
- [ ] Navigate to Accounts page successfully
- [ ] Navigate to Opportunities page successfully
- [ ] Navigate to Activities page successfully
- [ ] Search functionality works on each page
- [ ] Data loads without errors
- [ ] No JavaScript console errors

### ✅ Multi-Entity Workflow
- [ ] Lead → Account flow works
- [ ] Lead → Contact flow works
- [ ] Lead → Opportunity flow works
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
