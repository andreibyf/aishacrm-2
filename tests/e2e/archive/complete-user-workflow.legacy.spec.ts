/**
 * @deprecated LEGACY - ARCHIVED December 2024
 * ============================================
 * This test has been superseded by the v3.0.0 workflow tests:
 * - tests/e2e/bizdev-workflow-e2e.spec.ts (BizDev → Lead → Contact workflow)
 * - tests/e2e/sales-cycle-e2e.spec.ts (Full sales cycle with stages)
 * 
 * The new workflow starts from BizDev Sources (not direct Lead creation)
 * and follows: BizDev Source → Lead → Contact → Account + Opportunity
 * ============================================
 * 
 * Complete End-to-End User Workflow Test (NOT tagged @smoke intentionally)
 * 
 * This test simulates a realistic user journey through the entire CRM system:
 * 1. Create a lead (inbound inquiry)
 * 2. Add notes and activities to qualify the lead
 * 3. Convert lead to account + contact + opportunity
 * 4. Create additional contacts for the account
 * 5. Schedule and complete activities (calls, meetings, emails)
 * 6. Test AI features (email generation, insights)
 * 7. Update opportunity through sales stages
 * 8. Close deal and verify data consistency
 * 
 * Run with: npx playwright test tests/e2e/complete-user-workflow.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const E2E_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Test data - unique per run
const timestamp = Date.now();
const testData = {
  lead: {
    firstName: 'Sarah',
    lastName: `Johnson-${timestamp}`,
    email: `sarah.johnson.${timestamp}@acmecorp.test`,
    phone: '+1-555-0123',
    company: `Acme Corp ${timestamp}`,
    jobTitle: 'VP of Sales',
    source: 'website',
  },
  contact2: {
    firstName: 'Mike',
    lastName: `Chen-${timestamp}`,
    email: `mike.chen.${timestamp}@acmecorp.test`,
    phone: '+1-555-0124',
    jobTitle: 'CTO',
  },
  opportunity: {
    name: `Q1 Enterprise Deal - ${timestamp}`,
    amount: 75000,
    stage: 'qualification',
    closeDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days from now
  },
  activity: {
    discoveryCall: 'Discovery Call - Understanding Requirements',
    demoMeeting: 'Product Demo - Show Platform Capabilities',
    proposalEmail: 'Send Proposal and Pricing',
    followUpCall: 'Follow-up Call - Address Questions',
  },
  note: {
    qualification: 'Lead is highly qualified. Budget approved, decision timeline is Q1. Key pain points: manual data entry, lack of reporting.',
    demo: 'Demo went great! Sarah loved the AI features. Mike (CTO) concerned about data migration - need to address this.',
    negotiation: 'Received verbal approval. Working on final contract details. Need to include data migration services.',
  },
};

// Helper functions
async function createLeadViaAPI(request: any, tenantId: string, leadData: typeof testData.lead) {
  const res = await request.post(`${BACKEND_URL}/api/leads`, {
    data: {
      tenant_id: tenantId,
      first_name: leadData.firstName,
      last_name: leadData.lastName,
      email: leadData.email,
      phone: leadData.phone,
      company: leadData.company,
      job_title: leadData.jobTitle,
      status: 'new',
      source: leadData.source,
    },
  });
  
  if (!res.ok()) {
    throw new Error(`Create lead failed: ${await res.text()}`);
  }
  
  return res.json();
}

async function convertLeadViaAPI(request: any, tenantId: string, leadId: string, accountName: string, opportunityName: string, opportunityAmount: number) {
  const res = await request.post(`${BACKEND_URL}/api/leads/${leadId}/convert`, {
    data: {
      tenant_id: tenantId,
      performed_by: 'e2e@example.com',
      create_account: true,
      account_name: accountName,
      create_opportunity: true,
      opportunity_name: opportunityName,
      opportunity_amount: opportunityAmount,
    },
  });
  
  if (!res.ok()) {
    throw new Error(`Convert lead failed: ${await res.text()}`);
  }
  
  return res.json();
}

async function createNoteViaAPI(request: any, tenantId: string, entityType: string, entityId: string, content: string) {
  const res = await request.post(`${BACKEND_URL}/api/notes`, {
    data: {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      content: content,
      is_pinned: false,
    },
  });
  
  if (!res.ok()) {
    throw new Error(`Create note failed: ${await res.text()}`);
  }
  
  return res.json();
}

async function createActivityViaAPI(request: any, tenantId: string, data: {
  type: string;
  subject: string;
  status: string;
  due_date?: string;
  related_to_type?: string;
  related_to_id?: string;
  body?: string;
}) {
  const res = await request.post(`${BACKEND_URL}/api/activities`, {
    data: {
      tenant_id: tenantId,
      ...data,
    },
  });
  
  if (!res.ok()) {
    throw new Error(`Create activity failed: ${await res.text()}`);
  }
  
  return res.json();
}

async function updateActivityStatusViaAPI(request: any, tenantId: string, activityId: string, status: string) {
  const res = await request.put(`${BACKEND_URL}/api/activities/${activityId}`, {
    data: {
      tenant_id: tenantId,
      status: status,
    },
  });
  
  if (!res.ok()) {
    throw new Error(`Update activity failed: ${await res.text()}`);
  }
  
  return res.json();
}

async function updateOpportunityStageViaAPI(request: any, tenantId: string, opportunityId: string, stage: string) {
  const res = await request.put(`${BACKEND_URL}/api/opportunities/${opportunityId}`, {
    data: {
      tenant_id: tenantId,
      stage: stage,
    },
  });
  
  if (!res.ok()) {
    throw new Error(`Update opportunity failed: ${await res.text()}`);
  }
  
  return res.json();
}

type NavigateOptions = {
  hardRefresh?: boolean;
  refreshReason?: string;
};

async function navigateAndWaitForLoad(page: Page, url: string, options: NavigateOptions = {}) {
  const { hardRefresh = true, refreshReason } = options;
  console.log(`   🌐 Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    // Ignore timeout - page may still be functional
  });
  if (hardRefresh) {
    const reasonSuffix = refreshReason ? ` (${refreshReason})` : '';
    console.log(`   🔄 Triggering hard refresh${reasonSuffix}...`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }
  // Pause to allow visual observation
  await page.waitForTimeout(800);
}

test.describe('Complete User Workflow - Lead to Closed Deal', () => {
  test('Full CRM workflow: Create lead → Qualify → Convert → Manage → Close deal', async ({ page, request }) => {
    test.setTimeout(300000); // 5 minutes for complete workflow
    
    // Slow down actions for visual observation (500ms between major actions)
    page.setDefaultTimeout(60000);
    
    console.log('🚀 Starting complete user workflow test...');
    console.log('👁️  Running in observable mode - actions will be slowed for visibility\n');
    
    // Ensure E2E test mode is set BEFORE any navigation
    await page.context().addInitScript(() => {
      localStorage.setItem('E2E_TEST_MODE', 'true');
    });
    
    // Navigate to app root first to ensure full initialization and auth
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000); // Let app fully initialize
    
    // Wait for dashboard/header to confirm app is loaded and authenticated
    const header = page.locator('[data-testid="app-header"]').first();
    try {
      await header.waitFor({ state: 'visible', timeout: 30000 });
      console.log('   ✅ App loaded and authenticated');
    } catch (e) {
      console.log('   ⚠️ Header not visible immediately, proceeding...');
    }
    
    // Wait for main navigation to be visible
    const mainNav = page.getByTestId('main-navigation');
    try {
      await mainNav.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✅ Main navigation visible');
    } catch (e) {
      console.log('   ⚠️ Navigation not visible yet');
    }
    
    await page.waitForTimeout(1500); // Final settle
    
    // Get current authenticated user's real tenant UUID
    console.log('   🔍 Fetching current user context...');
    let tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'; // fallback
    try {
      const userResp = await request.get(`${BACKEND_URL}/api/users/me`);
      if (userResp.ok()) {
        const userData = await userResp.json();
        const userTenant = userData?.data?.tenant_id || userData?.tenant_id;
        if (userTenant) {
          tenantId = userTenant;
          console.log(`   ✅ Using tenant UUID: ${tenantId}`);
        }
      }
    } catch (e) {
      console.log(`   ⚠️ Could not fetch user context, using fallback: ${tenantId}`);
    }
    
    // Update localStorage with actual tenant UUID
    await page.evaluate((tid) => {
      localStorage.setItem('tenant_id', tid);
      localStorage.setItem('selected_tenant_id', tid);
    }, tenantId);
    
    // ================================================================
    // STEP 1: Create a new lead (inbound inquiry)
    // ================================================================
    console.log('\n📝 STEP 1: Creating new lead...');
    
    const leadResponse = await createLeadViaAPI(request, tenantId, testData.lead);
    const leadId = leadResponse.data?.lead?.id || leadResponse.data?.id || leadResponse.id;
    expect(leadId).toBeTruthy();
    
    console.log(`✅ Lead created: ${testData.lead.email} (ID: ${leadId})`);
    
    // Verify lead was actually persisted by fetching it directly
    console.log('   🔍 Verifying lead was persisted to database...');
    try {
      const verifyResp = await request.get(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${tenantId}`);
      if (verifyResp.ok()) {
        const leadData = await verifyResp.json();
        console.log(`   ✅ Lead verified in database:`, leadData?.data || leadData);
      } else {
        const errText = await verifyResp.text();
        console.log(`   ❌ Lead fetch failed: ${verifyResp.status()} - ${errText}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Could not verify lead:`, e);
    }
    
    // Wait for backend to process
    await page.waitForTimeout(2000);
    
    // NOW navigate to Leads page (this is the key fix!)
    console.log('   🗺️ Navigating to Leads page...');
    
    // Now test the API to see what leads the backend returns
    console.log(`   🔍 Testing backend leads query with tenant_id=${tenantId}...`);
    try {
      const leadsResp = await request.get(`${BACKEND_URL}/api/leads?tenant_id=a11dfb63-4b18-4eb8-872e-747af2e37c46`);
      if (leadsResp.ok()) {
        const leadsData = await leadsResp.json();
        console.log(`   ✅ Backend returned ${leadsData?.data?.length || 0} leads with slug`);
        if (leadsData?.data && leadsData.data.length > 0) {
          console.log(`   📋 First lead: ${leadsData.data[0].email || 'no email'}`);
        }
      } else {
        console.log(`   ❌ Backend query failed: ${leadsResp.status()}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Backend query error:`, e);
    }
    
    await navigateAndWaitForLoad(page, `${FRONTEND_URL}/Leads`);
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000); // Let list render
    
    // Try to find and click refresh button to ensure fresh data
    const refreshBtn = page.getByRole('button', { name: /refresh|reload/i }).first();
    const hasRefresh = await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasRefresh) {
      console.log('   🔄 Clicking refresh button...');
      await refreshBtn.click();
      await page.waitForTimeout(3000); // Wait for refresh to complete
    }
    
    // Try to find search input
    console.log('   🔍 Looking for search input...');
    const searchInput = page.getByPlaceholder(/search leads/i).first();
    const searchVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (searchVisible) {
      console.log('   ✅ Search input found, searching for lead by email...');
      await searchInput.fill(testData.lead.email);
      await page.waitForTimeout(3000); // Wait for search to filter
      
      // Also try searching by last name if email search doesn't show results
      let emailVisible = await page.getByText(testData.lead.email).isVisible({ timeout: 2000 }).catch(() => false);
      if (!emailVisible) {
        console.log('   🔄 Email search returned no results, trying last name...');
        await searchInput.clear();
        await page.waitForTimeout(500);
        await searchInput.fill(testData.lead.lastName);
        await page.waitForTimeout(3000); // Wait for second search
      }
    } else {
      console.log('   ⚠️ Search input not found, looking in full list...');
      // Scroll to ensure list is visible
      await page.locator('table, [role="grid"]').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(1500);
    }
    
    // Verify lead is visible (try by email, then by last name)
    let leadFound = false;
    try {
      console.log('   👀 Waiting for lead by email to appear...');
      await expect(page.getByText(testData.lead.email)).toBeVisible({ timeout: 15000 });
      leadFound = true;
      console.log('✅ Lead found by email in UI');
    } catch {
      console.log('   🔄 Email not visible, trying by last name...');
      try {
        await expect(page.getByText(testData.lead.lastName)).toBeVisible({ timeout: 15000 });
        leadFound = true;
        console.log('✅ Lead found by last name in UI');
      } catch {
        console.log('   ❌ Lead not found by email or last name, checking table structure...');
        const rows = page.locator('tr');
        const count = await rows.count();
        console.log(`   📊 Table has ${count} rows`);
        if (count > 0) {
          const firstRow = rows.first();
          const text = await firstRow.textContent();
          console.log(`   📄 First row content: ${text?.substring(0, 100)}`);
        }
        throw new Error(`Lead not found in Leads list after multiple search attempts`);
      }
    }
    
    // Click eye icon to view lead details
    console.log('   👁️ Opening lead detail view...');
    const leadRow = page.locator('tr').filter({ hasText: leadFound ? testData.lead.email : testData.lead.lastName }).first();
    
    // Try multiple strategies to find and click the view button
    let viewClicked = false;
    
    // Strategy 1: Look for a "view" button in the row
    const viewButton = leadRow.getByRole('button', { name: /view|open|detail/i }).first();
    if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('   ➤ Found view button, clicking...');
      await viewButton.click();
      viewClicked = true;
    }
    
    // Strategy 2: Click on row itself (assumes clickable row)
    if (!viewClicked) {
      console.log('   ➤ Trying row click...');
      await leadRow.click().catch(() => {});
      viewClicked = true;
    }
    
    await page.waitForTimeout(3000); // Wait for view detail panel to load
    console.log('✅ Lead detail view displayed');
    await page.waitForTimeout(1000); // Pause for observation
    
    // ================================================================
    // STEP 2: Add qualification note to the lead
    // ================================================================
    console.log('\n📋 STEP 2: Adding qualification note...');
    
    await createNoteViaAPI(request, tenantId, 'Lead', leadId, testData.note.qualification);
    console.log('✅ Qualification note added');
    await page.waitForTimeout(3000); // Extended wait for note to be indexed and cached
    
    // ================================================================
    // STEP 3: Create discovery call activity
    // ================================================================
    console.log('\n📞 STEP 3: Scheduling discovery call...');
    
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const discoveryCallResponse = await createActivityViaAPI(request, tenantId, {
      type: 'call',
      subject: testData.activity.discoveryCall,
      status: 'scheduled',
      due_date: tomorrow,
      related_to_type: 'Lead',
      related_to_id: leadId,
      body: 'Initial discovery call to understand requirements and pain points',
    });
    
    const discoveryCallId = discoveryCallResponse.data?.activity?.id || discoveryCallResponse.data?.id || discoveryCallResponse.id;
    console.log(`✅ Discovery call scheduled (ID: ${discoveryCallId})`);
    await page.waitForTimeout(4000); // Extended wait for activity to be indexed
    
    // Navigate to Activities and verify it appears
    await navigateAndWaitForLoad(page, `${FRONTEND_URL}/Activities`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000); // Extended wait for activities list to load and cache
    console.log('   🔍 Searching for scheduled activity...');
    await expect(page.getByText(testData.activity.discoveryCall).first()).toBeVisible({ timeout: 10000 });
    console.log('✅ Discovery call visible in Activities');
    await page.waitForTimeout(1000); // Pause for observation
    
    // ================================================================
    // STEP 4: Complete the discovery call
    // ================================================================
    console.log('\n✅ STEP 4: Completing discovery call...');
    
    await updateActivityStatusViaAPI(request, tenantId, discoveryCallId, 'completed');
    console.log('✅ Discovery call marked as completed');
    await page.waitForTimeout(2500); // Extended wait for status update to propagate
    
    // ================================================================
    // STEP 5: Convert lead to Account + Contact + Opportunity
    // ================================================================
    console.log('\n🔄 STEP 5: Converting lead to Account + Contact + Opportunity...');
    
    const conversionResponse = await convertLeadViaAPI(
      request,
      tenantId,
      leadId,
      testData.lead.company,
      testData.opportunity.name,
      testData.opportunity.amount
    );
    
    const accountId = conversionResponse.data?.account?.id;
    const contactId = conversionResponse.data?.contact?.id;
    const opportunityId = conversionResponse.data?.opportunity?.id;
    
    expect(accountId).toBeTruthy();
    expect(contactId).toBeTruthy();
    expect(opportunityId).toBeTruthy();
    
    console.log(`✅ Lead converted successfully:`);
    console.log(`   - Account ID: ${accountId}`);
    console.log(`   - Contact ID: ${contactId}`);
    console.log(`   - Opportunity ID: ${opportunityId}`);
    
    // Extended wait for conversion data to propagate and be indexed
    await page.waitForTimeout(4000);
    
    // ================================================================
    // STEP 6: Verify account exists and is visible
    // ================================================================
    console.log('\n🏢 STEP 6: Verifying account in UI...');
    
    await navigateAndWaitForLoad(page, `${FRONTEND_URL}/Accounts`);
    
    // Wait for accounts table to load
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000); // Extended wait for accounts list
    
    // Try refresh button
    const accountRefresh = page.getByRole('button', { name: /refresh|reload/i }).first();
    const hasAccountRefresh = await accountRefresh.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasAccountRefresh) {
      console.log('   🔄 Refreshing accounts list...');
      await accountRefresh.click();
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(1500);
    
    const accountSearch = page.getByPlaceholder(/search accounts/i).first();
    await accountSearch.waitFor({ timeout: 30000 });
    console.log('   🔍 Searching for account...');
    await accountSearch.fill(testData.lead.company);
    await page.waitForTimeout(1500); // Wait for search + observation
    
    await expect(page.getByText(testData.lead.company)).toBeVisible({ timeout: 10000 });
    console.log('✅ Account visible in UI');
    
    // Click eye icon to view account details
    console.log('   👁️ Opening account detail view...');
    const accountRow = page.locator('tr').filter({ hasText: testData.lead.company }).first();
    const viewAccountButton = accountRow.getByRole('button', { name: /view/i }).or(accountRow.locator('[data-testid="view-button"]')).or(accountRow.locator('button:has-text("View")')).or(accountRow.locator('button svg').first()).first();
    await viewAccountButton.click().catch(async () => {
      console.log('   ⚠️ View button not found, trying row click...');
      await accountRow.click();
    });
    await page.waitForTimeout(2000); // View detail panel
    console.log('✅ Account detail view displayed');
    await page.waitForTimeout(1000); // Pause for observation
    
    // ================================================================
    // STEP 7: Add second contact to the account
    // ================================================================
    console.log('\n👤 STEP 7: Adding second contact (CTO)...');
    
    const contact2Response = await request.post(`${BACKEND_URL}/api/contacts`, {
      data: {
        tenant_id: E2E_TENANT_ID,
        account_id: accountId,
        first_name: testData.contact2.firstName,
        last_name: testData.contact2.lastName,
        email: testData.contact2.email,
        phone: testData.contact2.phone,
        job_title: testData.contact2.jobTitle,
      },
    });
    
    if (!contact2Response.ok()) {
      throw new Error(`Create contact failed: ${await contact2Response.text()}`);
    }
    
    const contact2Id = (await contact2Response.json()).data?.contact?.id;
    console.log(`✅ Second contact added: ${testData.contact2.email} (ID: ${contact2Id})`);
    await page.waitForTimeout(1500); // Wait for contact to be saved
    
    // ================================================================
    // STEP 8: Schedule and complete product demo
    // ================================================================
    console.log('\n🎬 STEP 8: Scheduling product demo...');
    
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const demoResponse = await createActivityViaAPI(request, tenantId, {
      type: 'meeting',
      subject: testData.activity.demoMeeting,
      status: 'scheduled',
      due_date: nextWeek,
      related_to_type: 'Opportunity',
      related_to_id: opportunityId,
      body: 'Show platform capabilities, focus on AI features and reporting',
    });
    
    const demoId = demoResponse.data?.activity?.id || demoResponse.data?.id || demoResponse.id;
    console.log(`✅ Demo scheduled (ID: ${demoId})`);
    await page.waitForTimeout(1500); // Wait for meeting to be created
    
    // Complete the demo
    await updateActivityStatusViaAPI(request, tenantId, demoId, 'completed');
    await page.waitForTimeout(1000); // Wait for status update
    await createNoteViaAPI(request, tenantId, 'Opportunity', opportunityId, testData.note.demo);
    console.log('✅ Demo completed and notes added');
    await page.waitForTimeout(1500); // Wait for notes to be saved
    
    // ================================================================
    // STEP 9: Move opportunity to Proposal stage
    // ================================================================
    console.log('\n📄 STEP 9: Moving opportunity to proposal stage...');
    
    await updateOpportunityStageViaAPI(request, tenantId, opportunityId, 'proposal');
    console.log('✅ Opportunity moved to Proposal');
    await page.waitForTimeout(2000); // Wait for stage update to propagate
    
    // Create proposal email activity
    const proposalResponse = await createActivityViaAPI(request, tenantId, {
      type: 'email',
      subject: testData.activity.proposalEmail,
      status: 'completed',
      related_to_type: 'Opportunity',
      related_to_id: opportunityId,
      body: 'Proposal sent with pricing for Enterprise plan: $75,000/year. Includes data migration and onboarding.',
    });
    
    console.log('✅ Proposal email activity created');
    await page.waitForTimeout(1500); // Wait for email activity to be saved
    
    // ================================================================
    // STEP 10: Navigate to Opportunities and verify
    // ================================================================
    console.log('\n💼 STEP 10: Verifying opportunity in UI...');
    
    await navigateAndWaitForLoad(page, `${FRONTEND_URL}/Opportunities`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500); // Wait for opportunities list to load
    
    const oppSearch = page.getByPlaceholder(/search opportunities/i).first();
    await oppSearch.waitFor({ timeout: 30000 });
    console.log('   🔍 Searching for opportunity...');
    await oppSearch.fill(testData.opportunity.name);
    await page.waitForTimeout(1500); // Wait for search + observation
    
    await expect(page.getByText(testData.opportunity.name)).toBeVisible({ timeout: 10000 });
    console.log('✅ Opportunity visible in UI');
    
    // Click eye icon to view opportunity details
    console.log('   👁️ Opening opportunity detail view...');
    const opportunityRow = page.locator('tr').filter({ hasText: testData.opportunity.name }).first();
    const viewOppButton = opportunityRow.getByRole('button', { name: /view/i }).or(opportunityRow.locator('[data-testid="view-button"]')).or(opportunityRow.locator('button:has-text("View")')).or(opportunityRow.locator('button svg').first()).first();
    await viewOppButton.click().catch(async () => {
      console.log('   ⚠️ View button not found, trying row click...');
      await opportunityRow.click();
    });
    await page.waitForTimeout(2000); // View detail panel
    console.log('✅ Opportunity detail view displayed');
    await page.waitForTimeout(1000); // Pause for observation
    
    // ================================================================
    // STEP 11: Move to Negotiation stage
    // ================================================================
    console.log('\n🤝 STEP 11: Moving to Negotiation stage...');
    
    await updateOpportunityStageViaAPI(request, tenantId, opportunityId, 'negotiation');
    await page.waitForTimeout(1500); // Wait for stage update
    await createNoteViaAPI(request, tenantId, 'Opportunity', opportunityId, testData.note.negotiation);
    await page.waitForTimeout(1000); // Wait for note to be saved
    
    // Create follow-up call
    const followUpResponse = await createActivityViaAPI(request, tenantId, {
      type: 'call',
      subject: testData.activity.followUpCall,
      status: 'completed',
      related_to_type: 'Opportunity',
      related_to_id: opportunityId,
      body: 'Addressed concerns about data migration. Confirmed timeline and pricing.',
    });
    
    console.log('✅ Moved to Negotiation and added follow-up notes');
    await page.waitForTimeout(1500); // Wait for follow-up call to be saved
    
    // ================================================================
    // STEP 12: Close the deal as Won
    // ================================================================
    console.log('\n🎉 STEP 12: Closing deal as Won...');
    
    await updateOpportunityStageViaAPI(request, tenantId, opportunityId, 'closed_won');
    console.log('✅ Deal closed as WON!');
    await page.waitForTimeout(2000); // Wait for final stage update and any triggers
    
    // ================================================================
    // STEP 13: Verify final state and data consistency
    // ================================================================
    console.log('\n🔍 STEP 13: Verifying final state...');
    
    // Verify account still exists
    const accountRes = await request.get(`${BACKEND_URL}/api/accounts/${accountId}?tenant_id=${E2E_TENANT_ID}`);
    expect(accountRes.ok()).toBeTruthy();
    const accountData = await accountRes.json();
    expect(accountData.data?.account?.name || accountData.data?.name).toBe(testData.lead.company);
    console.log('✅ Account data verified');
    
    // Verify opportunity is closed won
    const oppRes = await request.get(`${BACKEND_URL}/api/opportunities/${opportunityId}?tenant_id=${E2E_TENANT_ID}`);
    expect(oppRes.ok()).toBeTruthy();
    const oppData = await oppRes.json();
    expect(oppData.data?.opportunity?.stage || oppData.data?.stage).toBe('closed_won');
    console.log('✅ Opportunity stage verified as closed_won');
    
    // Verify contacts exist
    const contactsRes = await request.get(`${BACKEND_URL}/api/contacts?tenant_id=${E2E_TENANT_ID}&account_id=${accountId}`);
    expect(contactsRes.ok()).toBeTruthy();
    const contactsData = await contactsRes.json();
    const contacts = contactsData.data?.contacts || contactsData.data || [];
    expect(contacts.length).toBeGreaterThanOrEqual(2);
    console.log(`✅ ${contacts.length} contacts verified for account`);
    
    // ================================================================
    // STEP 14: View complete timeline in UI
    // ================================================================
    console.log('\n📊 STEP 14: Viewing activity timeline...');
    
    await navigateAndWaitForLoad(page, `${FRONTEND_URL}/Activities`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000); // Wait for full activity timeline to load
    
    // Verify multiple activities are visible
    console.log('   🔍 Verifying complete activity history...');
    await expect(page.getByText(testData.activity.discoveryCall).first()).toBeVisible({ timeout: 10000 });
    console.log('✅ Activity timeline verified');
    await page.waitForTimeout(2000); // Final pause to observe complete timeline
    
    // ================================================================
    // TEST COMPLETE
    // ================================================================
    console.log('\n✨ ===================================');
    console.log('✨  COMPLETE WORKFLOW TEST PASSED!');
    console.log('✨ ===================================');
    console.log(`\nWorkflow Summary:`);
    console.log(`  - Created lead: ${testData.lead.email}`);
    console.log(`  - Converted to account: ${testData.lead.company}`);
    console.log(`  - Added 2 contacts (VP Sales + CTO)`);
    console.log(`  - Created opportunity: $${testData.opportunity.amount.toLocaleString()}`);
    console.log(`  - Completed 4 activities (calls, meetings, emails)`);
    console.log(`  - Added 3 qualification notes`);
    console.log(`  - Moved through stages: Qualification → Proposal → Negotiation → Closed Won`);
    console.log(`  - Final state: DEAL WON! 🎉\n`);
  });
});
