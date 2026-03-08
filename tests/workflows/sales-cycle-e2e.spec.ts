/**
 * @version 3.0.0 - CURRENT (December 2024)
 * ============================================
 * Complete Sales Cycle E2E Test
 * 
 * Companion test to bizdev-workflow-e2e.spec.ts for comprehensive
 * sales cycle coverage including opportunity stage progression.
 * ============================================
 * 
 * Tests the full journey from BizDev Source to Closed-Won Opportunity:
 * 1. BizDev Source creation
 * 2. Promotion to Lead
 * 3. Lead qualification with activities and notes
 * 4. Conversion to Contact + Account + Opportunity
 * 5. Opportunity progression through sales stages
 * 6. Close deal (won/lost)
 * 7. Verify final data relationships and provenance
 * 
 * Run with: npx playwright test tests/e2e/sales-cycle-e2e.spec.ts
 */

import { test, expect, APIRequestContext as _APIRequestContext } from '@playwright/test';
import {
  BACKEND_URL,
  E2E_TENANT_ID,
  createBizDevSource,
  promoteBizDevSource,
  getBizDevSource,
  getLead as _getLead,
  convertLead,
  getContact,
  getAccount,
  getOpportunity,
  createNote,
  createActivity,
  updateActivityStatus,
  updateOpportunityStage,
} from '../helpers/helpers';

test.describe('[WORKFLOWS] Complete Sales Cycle - BizDev to Closed Deal', () => {
  
  test('full B2B sales cycle: source → lead → qualify → convert → progress → close-won', async ({ request }) => {
    const ts = Date.now();
    const testCompany = `Enterprise Client ${ts}`;
    const testContact = `Decision Maker ${ts}`;
    const testEmail = `decision.maker.${ts}@enterprise.test`;
    
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          COMPLETE B2B SALES CYCLE E2E TEST                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    // ══════════════════════════════════════════════════════════════
    // STAGE 1: Create BizDev Source (Lead Generation)
    // ══════════════════════════════════════════════════════════════
    console.log('\n📥 STAGE 1: Lead Generation - Create BizDev Source');
    
    const sourceResult = await createBizDevSource(request, {
      source_name: `Trade Show Lead ${ts}`,  // Required field
      company_name: testCompany,
      contact_person: testContact,
      contact_email: testEmail,
      contact_phone: '+1-555-ENTERPRISE',
      source_type: 'trade_show',
      industry: 'Enterprise Software',
      website: 'https://enterprise.test',
      address_line_1: '1 Enterprise Plaza',
      city: 'New York',
      state_province: 'NY',
      postal_code: '10001',
      country: 'United States',
    });
    
    const sourceId = sourceResult?.data?.id || sourceResult?.id;
    expect(sourceId).toBeTruthy();
    console.log(`   ✓ BizDev Source created: ${sourceId}`);
    console.log(`   ✓ Company: ${testCompany}`);
    console.log(`   ✓ Contact: ${testContact} (${testEmail})`);
    
    // Verify source status
    const sourceData = await getBizDevSource(request, sourceId);
    expect(sourceData?.data?.status || sourceData?.status).toBe('Active');
    
    // ══════════════════════════════════════════════════════════════
    // STAGE 2: Promote to Lead (Sales Qualification)
    // ══════════════════════════════════════════════════════════════
    console.log('\n🎯 STAGE 2: Sales Qualification - Promote to Lead');
    
    const promoteResult = await promoteBizDevSource(request, sourceId, 'B2B');
    const leadId = promoteResult?.data?.lead?.id;
    const accountIdFromPromotion = promoteResult?.data?.account_id;
    
    expect(leadId).toBeTruthy();
    console.log(`   ✓ Lead created: ${leadId}`);
    console.log(`   ✓ Lead type: ${promoteResult?.data?.lead_type}`);
    if (accountIdFromPromotion) {
      console.log(`   ✓ Account linked: ${accountIdFromPromotion}`);
    }
    
    // Verify BizDev source marked as promoted
    const promotedSource = await getBizDevSource(request, sourceId);
    expect(promotedSource?.data?.status || promotedSource?.status).toBe('Promoted');
    console.log(`   ✓ Source status updated to: Promoted`);
    
    // ══════════════════════════════════════════════════════════════
    // STAGE 3: Lead Qualification (Activities & Notes)
    // ══════════════════════════════════════════════════════════════
    console.log('\n📝 STAGE 3: Lead Qualification - Activities & Notes');
    
    // Create qualification note
    const qualNote = await createNote(request, 'Lead', leadId, 
      `QUALIFICATION NOTES:\n` +
      `- Budget: $100K+ approved for Q1\n` +
      `- Authority: ${testContact} is VP of Operations, has budget authority\n` +
      `- Need: Current system cannot scale, need 3x capacity\n` +
      `- Timeline: Decision by end of quarter\n\n` +
      `BANT Score: 4/4 - HIGHLY QUALIFIED`
    );
    // API returns { data: { note: {...} } }
    expect(qualNote?.data?.note?.id || qualNote?.data?.id || qualNote?.id).toBeTruthy();
    console.log(`   ✓ Qualification note added`);
    
    // Create discovery call activity
    const discoveryCall = await createActivity(request, {
      type: 'call',
      subject: `Discovery Call - ${testCompany}`,
      status: 'completed',
      body: 'Discussed requirements. Client needs enterprise solution with API integration.',
      related_to_type: 'Lead',
      related_to_id: leadId,
    });
    // API returns { data: { activity: {...} } }
    expect(discoveryCall?.data?.activity?.id || discoveryCall?.data?.id || discoveryCall?.id).toBeTruthy();
    console.log(`   ✓ Discovery call logged (completed)`);
    
    // Schedule demo meeting
    const demoMeeting = await createActivity(request, {
      type: 'meeting',
      subject: `Product Demo - ${testCompany}`,
      status: 'scheduled',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      body: 'Full platform demo with technical team',
      related_to_type: 'Lead',
      related_to_id: leadId,
    });
    // API returns { data: { activity: {...} } }
    const demoId = demoMeeting?.data?.activity?.id || demoMeeting?.data?.id || demoMeeting?.id;
    expect(demoId).toBeTruthy();
    console.log(`   ✓ Demo meeting scheduled`);
    
    // ══════════════════════════════════════════════════════════════
    // STAGE 4: Convert Lead (Create Contact + Account + Opportunity)
    // ══════════════════════════════════════════════════════════════
    console.log('\n🔄 STAGE 4: Lead Conversion - Contact + Account + Opportunity');
    
    const opportunityName = `${testCompany} - Enterprise Platform Deal`;
    const opportunityAmount = 125000;
    const accountName = testCompany;
    
    const conversionResult = await convertLead(request, leadId, {
      create_account: true,
      account_name: accountName,
      create_opportunity: true,
      opportunity_name: opportunityName,
      opportunity_amount: opportunityAmount,
    });
    
    const contactId = conversionResult?.data?.contact?.id;
    const accountId = conversionResult?.data?.account?.id;
    const opportunityId = conversionResult?.data?.opportunity?.id;
    
    expect(contactId).toBeTruthy();
    expect(accountId).toBeTruthy();
    expect(opportunityId).toBeTruthy();
    
    console.log(`   ✓ Contact created: ${contactId}`);
    console.log(`   ✓ Account created: ${accountId}`);
    console.log(`   ✓ Opportunity created: ${opportunityId}`);
    console.log(`   ✓ Deal value: $${opportunityAmount.toLocaleString()}`);
    
    // Verify relationships
    const contact = await getContact(request, contactId);
    expect(contact?.data?.account_id || contact?.account_id).toBe(accountId);
    
    const opportunity = await getOpportunity(request, opportunityId);
    expect(opportunity?.data?.contact_id || opportunity?.contact_id).toBe(contactId);
    expect(opportunity?.data?.account_id || opportunity?.account_id).toBe(accountId);
    console.log(`   ✓ Relationships verified`);
    
    // ══════════════════════════════════════════════════════════════
    // STAGE 5: Opportunity Progression (Sales Pipeline)
    // ══════════════════════════════════════════════════════════════
    console.log('\n📈 STAGE 5: Sales Pipeline - Opportunity Progression');
    
    const stages = [
      { stage: 'qualification', description: 'Initial qualification' },
      { stage: 'proposal', description: 'Proposal sent' },
      { stage: 'negotiation', description: 'Contract negotiation' },
    ];
    
    for (const { stage, description } of stages) {
      await updateOpportunityStage(request, opportunityId, stage);
      const updated = await getOpportunity(request, opportunityId);
      expect(updated?.data?.stage || updated?.stage).toBe(stage);
      console.log(`   ✓ Stage: ${stage} - ${description}`);
    }
    
    // Add activities for each stage
    console.log('\n   Adding stage activities...');
    
    // Complete the demo (from earlier)
    await updateActivityStatus(request, demoId, 'completed');
    console.log(`   ✓ Demo meeting completed`);
    
    // Proposal activity
    const proposalActivity = await createActivity(request, {
      type: 'email',
      subject: `Proposal Sent - ${testCompany}`,
      status: 'completed',
      body: 'Sent detailed proposal with pricing tiers and implementation timeline.',
      related_to_type: 'Opportunity',
      related_to_id: opportunityId,
    });
    // API returns { data: { activity: {...} } }
    expect(proposalActivity?.data?.activity?.id || proposalActivity?.data?.id || proposalActivity?.id).toBeTruthy();
    console.log(`   ✓ Proposal email logged`);
    
    // Negotiation note
    const negotiationNote = await createNote(request, 'Opportunity', opportunityId,
      `NEGOTIATION STATUS:\n` +
      `- Legal review in progress\n` +
      `- Pricing approved by CFO\n` +
      `- Implementation timeline agreed: 6 weeks\n` +
      `- Expected close: End of week`
    );
    // API returns { data: { note: {...} } }
    expect(negotiationNote?.data?.note?.id || negotiationNote?.data?.id || negotiationNote?.id).toBeTruthy();
    console.log(`   ✓ Negotiation notes added`);
    
    // ══════════════════════════════════════════════════════════════
    // STAGE 6: Close Deal (Won!)
    // ══════════════════════════════════════════════════════════════
    console.log('\n🎉 STAGE 6: Close Deal - WON!');
    
    await updateOpportunityStage(request, opportunityId, 'closed_won');
    
    const finalOpportunity = await getOpportunity(request, opportunityId);
    expect(finalOpportunity?.data?.stage || finalOpportunity?.stage).toBe('closed_won');
    console.log(`   ✓ Deal closed as WON!`);
    console.log(`   ✓ Final amount: $${opportunityAmount.toLocaleString()}`);
    
    // Add closing note
    const closingNote = await createNote(request, 'Opportunity', opportunityId,
      `🎉 DEAL CLOSED - WON!\n` +
      `- Contract signed: ${new Date().toISOString().split('T')[0]}\n` +
      `- Deal value: $${opportunityAmount.toLocaleString()}\n` +
      `- Implementation start: Next Monday\n` +
      `- Customer success handoff: Scheduled`
    );
    // API returns { data: { note: {...} } }
    expect(closingNote?.data?.note?.id || closingNote?.data?.id || closingNote?.id).toBeTruthy();
    console.log(`   ✓ Closing notes added`);
    
    // ══════════════════════════════════════════════════════════════
    // FINAL VERIFICATION: Data Integrity & Provenance
    // ══════════════════════════════════════════════════════════════
    console.log('\n✅ FINAL VERIFICATION: Data Integrity & Provenance');
    
    // Verify complete data chain
    const finalSource = await getBizDevSource(request, sourceId);
    const finalContact = await getContact(request, contactId);
    const finalAccount = await getAccount(request, accountId);
    const finalOpp = await getOpportunity(request, opportunityId);
    
    // Source → Lead provenance
    expect(finalSource?.data?.metadata?.promoted_to_lead_id || finalSource?.metadata?.promoted_to_lead_id).toBe(leadId);
    console.log(`   ✓ Source→Lead provenance: ${sourceId} → ${leadId}`);
    
    // Lead → Contact provenance
    expect(finalContact?.data?.metadata?.converted_from_lead_id || finalContact?.metadata?.converted_from_lead_id).toBe(leadId);
    console.log(`   ✓ Lead→Contact provenance: ${leadId} → ${contactId}`);
    
    // Contact → Account relationship
    expect(finalContact?.data?.account_id || finalContact?.account_id).toBe(accountId);
    console.log(`   ✓ Contact→Account: ${contactId} → ${accountId}`);
    
    // Opportunity relationships
    expect(finalOpp?.data?.contact_id || finalOpp?.contact_id).toBe(contactId);
    expect(finalOpp?.data?.account_id || finalOpp?.account_id).toBe(accountId);
    console.log(`   ✓ Opportunity→Contact: ${opportunityId} → ${contactId}`);
    console.log(`   ✓ Opportunity→Account: ${opportunityId} → ${accountId}`);
    
    // Tenant isolation
    expect(finalSource?.data?.tenant_id || finalSource?.tenant_id).toBe(E2E_TENANT_ID);
    expect(finalContact?.data?.tenant_id || finalContact?.tenant_id).toBe(E2E_TENANT_ID);
    expect(finalAccount?.data?.tenant_id || finalAccount?.tenant_id).toBe(E2E_TENANT_ID);
    expect(finalOpp?.data?.tenant_id || finalOpp?.tenant_id).toBe(E2E_TENANT_ID);
    console.log(`   ✓ All records in correct tenant: ${E2E_TENANT_ID}`);
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║               🎉 SALES CYCLE TEST COMPLETE! 🎉               ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ BizDev Source: ${sourceId.substring(0, 8)}... (Promoted)         ║`);
    console.log(`║ Lead:          ${leadId.substring(0, 8)}... (Converted)          ║`);
    console.log(`║ Contact:       ${contactId.substring(0, 8)}...                    ║`);
    console.log(`║ Account:       ${accountId.substring(0, 8)}...                    ║`);
    console.log(`║ Opportunity:   ${opportunityId.substring(0, 8)}... (CLOSED WON)   ║`);
    console.log(`║ Deal Value:    $${opportunityAmount.toLocaleString()}                              ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
  });
  
  test('sales cycle with lost opportunity', async ({ request }) => {
    const ts = Date.now();
    
    console.log('\n📉 TEST: Sales Cycle - Lost Opportunity');
    
    // Quick setup: source → lead → convert
    const sourceResult = await createBizDevSource(request, {
      source_name: `Lost Deal Source ${ts}`,
      company_name: `Lost Deal Co ${ts}`,
      contact_email: `lost.${ts}@test.com`,
    });
    const sourceId = sourceResult?.data?.id || sourceResult?.id;
    
    const promoteResult = await promoteBizDevSource(request, sourceId, 'B2B');
    const leadId = promoteResult?.data?.lead?.id;
    
    const conversionResult = await convertLead(request, leadId, {
      create_account: true,
      account_name: `Lost Deal Account ${ts}`,
      create_opportunity: true,
      opportunity_name: `Lost Deal ${ts}`,
      opportunity_amount: 50000,
    });
    
    const opportunityId = conversionResult?.data?.opportunity?.id;
    expect(opportunityId).toBeTruthy();
    
    // Progress through stages then lose
    await updateOpportunityStage(request, opportunityId, 'qualification');
    await updateOpportunityStage(request, opportunityId, 'proposal');
    
    // Add loss reason note
    await createNote(request, 'Opportunity', opportunityId,
      `LOSS ANALYSIS:\n` +
      `- Reason: Competitor pricing 20% lower\n` +
      `- Budget constraints on client side\n` +
      `- Learnings: Need to emphasize ROI earlier in process`
    );
    
    // Mark as lost
    await updateOpportunityStage(request, opportunityId, 'closed_lost');
    
    const lostOpp = await getOpportunity(request, opportunityId);
    expect(lostOpp?.data?.stage || lostOpp?.stage).toBe('closed_lost');
    
    console.log(`   ✓ Opportunity marked as closed_lost`);
    console.log(`   ✓ Loss analysis documented`);
  });
  
  test('sales cycle with existing account (select account, not create)', async ({ request }) => {
    const ts = Date.now();
    
    console.log('\n🔗 TEST: Lead Conversion - Link to Existing Account');
    
    // First, create an account directly
    const accountRes = await request.post(`${BACKEND_URL}/api/accounts`, {
      data: {
        tenant_id: E2E_TENANT_ID,
        name: `Existing Account ${ts}`,
        type: 'customer',
        industry: 'Technology',
      },
    });
    expect(accountRes.ok()).toBeTruthy();
    const accountData = await accountRes.json();
    const existingAccountId = accountData?.data?.id || accountData?.id;
    expect(existingAccountId).toBeTruthy();
    console.log(`   ✓ Pre-existing account: ${existingAccountId}`);
    
    // Create BizDev source and promote to lead
    const sourceResult = await createBizDevSource(request, {
      source_name: `Existing Account Lead ${ts}`,
      company_name: `Existing Account ${ts}`, // Same company name
      contact_person: `New Contact ${ts}`,
      contact_email: `new.contact.${ts}@existing.test`,
    });
    const sourceId = sourceResult?.data?.id || sourceResult?.id;
    
    const promoteResult = await promoteBizDevSource(request, sourceId, 'B2B');
    const leadId = promoteResult?.data?.lead?.id;
    
    // Convert but SELECT existing account instead of creating new
    const conversionResult = await convertLead(request, leadId, {
      create_account: false, // Don't create new
      selected_account_id: existingAccountId, // Link to existing
      create_opportunity: true,
      opportunity_name: `Upsell to Existing ${ts}`,
      opportunity_amount: 25000,
    });
    
    const contactId = conversionResult?.data?.contact?.id;
    const opportunityId = conversionResult?.data?.opportunity?.id;
    
    expect(contactId).toBeTruthy();
    expect(opportunityId).toBeTruthy();
    
    // Verify contact linked to existing account
    const contact = await getContact(request, contactId);
    expect(contact?.data?.account_id || contact?.account_id).toBe(existingAccountId);
    console.log(`   ✓ New contact linked to existing account`);
    
    // Verify opportunity linked to existing account
    const opportunity = await getOpportunity(request, opportunityId);
    expect(opportunity?.data?.account_id || opportunity?.account_id).toBe(existingAccountId);
    console.log(`   ✓ Opportunity linked to existing account`);
    console.log(`   ✓ Upsell opportunity created for existing customer`);
  });
});

test.describe('[WORKFLOWS] Multi-Tenant Sales Isolation', () => {
  
  test('records created in one tenant not visible in another', async ({ request }) => {
    const ts = Date.now();
    const wrongTenantId = '6cb4c008-4847-426a-9a2e-918ad70e7b69'; // Labor Depot
    
    console.log('\n🔒 TEST: Multi-Tenant Isolation');
    
    // Create BizDev source in E2E tenant
    const sourceResult = await createBizDevSource(request, {
      source_name: `Isolation Test Source ${ts}`,
      company_name: `Isolation Test ${ts}`,
      contact_email: `isolation.${ts}@test.com`,
    });
    const sourceId = sourceResult?.data?.id || sourceResult?.id;
    
    // Try to fetch from wrong tenant
    const wrongTenantRes = await request.get(
      `${BACKEND_URL}/api/bizdevsources/${sourceId}?tenant_id=${wrongTenantId}`
    );
    
    if (wrongTenantRes.ok()) {
      const wrongData = await wrongTenantRes.json();
      // Should either be empty or not match our record
      const record = wrongData?.data || wrongData;
      expect(record?.id).not.toBe(sourceId);
    } else {
      // 404 or 403 is expected
      expect(wrongTenantRes.status()).toBeGreaterThanOrEqual(400);
    }
    
    console.log(`   ✓ Record not accessible from wrong tenant`);
    console.log(`   ✓ Tenant isolation enforced`);
  });
});
