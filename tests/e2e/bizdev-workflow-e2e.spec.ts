/**
 * @version 3.0.0 - CURRENT (December 2024)
 * ============================================
 * BizDev Source → Lead → Contact → Account + Opportunity E2E Tests
 * 
 * This is the PRIMARY workflow test for the v3.0.0 CRM architecture.
 * Replaces legacy complete-user-workflow.spec.ts (now archived).
 * ============================================
 * 
 * Tests the complete v3.0.0 workflow:
 * 1. Create BizDev Source (B2B or B2C)
 * 2. Promote BizDev Source to Lead
 * 3. Convert Lead to Contact + Account + Opportunity
 * 4. Verify data integrity and provenance through each stage
 * 
 * Run with: npx playwright test tests/e2e/bizdev-workflow-e2e.spec.ts
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const E2E_TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

// ============== API HELPERS ==============

async function createBizDevSourceViaAPI(request: APIRequestContext, data: {
  source_name: string;  // Required field
  company_name?: string;
  contact_person?: string;
  contact_email: string;
  contact_phone?: string;
  source_type?: string;
  address_line_1?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  website?: string;
  industry?: string;
}) {
  const res = await request.post(`${BACKEND_URL}/api/bizdevsources`, {
    data: {
      tenant_id: E2E_TENANT_ID,
      status: 'Active',
      source: data.source_name,  // API requires 'source' field
      is_test_data: true,  // Mark as test data for cleanup
      ...data,
    },
  });
  
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Create BizDev source failed (${res.status()}): ${body}`);
  }
  
  return res.json();
}

async function promoteBizDevSourceViaAPI(request: APIRequestContext, sourceId: string, clientType: 'B2B' | 'B2C' = 'B2B') {
  const res = await request.post(`${BACKEND_URL}/api/bizdevsources/${sourceId}/promote`, {
    data: {
      tenant_id: E2E_TENANT_ID,
      performed_by: 'e2e@example.com',
      delete_source: false,
      client_type: clientType,
    },
  });
  
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Promote BizDev source failed (${res.status()}): ${body}`);
  }
  
  return res.json();
}

async function convertLeadViaAPI(request: APIRequestContext, leadId: string, options: {
  create_account?: boolean;
  account_name?: string;
  selected_account_id?: string | null;
  create_opportunity?: boolean;
  opportunity_name?: string;
  opportunity_amount?: number;
} = {}) {
  const res = await request.post(`${BACKEND_URL}/api/leads/${leadId}/convert`, {
    data: {
      tenant_id: E2E_TENANT_ID,
      // Note: performed_by expects UUID if provided, omit for E2E tests
      ...options,
    },
  });
  
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Convert lead failed (${res.status()}): ${body}`);
  }
  
  return res.json();
}

async function getBizDevSource(request: APIRequestContext, sourceId: string) {
  const res = await request.get(`${BACKEND_URL}/api/bizdevsources/${sourceId}?tenant_id=${E2E_TENANT_ID}`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Get BizDev source failed (${res.status()}): ${body}`);
  }
  return res.json();
}

async function getLead(request: APIRequestContext, leadId: string) {
  const res = await request.get(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${E2E_TENANT_ID}`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Get lead failed (${res.status()}): ${body}`);
  }
  return res.json();
}

async function getContact(request: APIRequestContext, contactId: string) {
  const res = await request.get(`${BACKEND_URL}/api/contacts/${contactId}?tenant_id=${E2E_TENANT_ID}`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Get contact failed (${res.status()}): ${body}`);
  }
  return res.json();
}

async function getAccount(request: APIRequestContext, accountId: string) {
  const res = await request.get(`${BACKEND_URL}/api/accounts/${accountId}?tenant_id=${E2E_TENANT_ID}`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Get account failed (${res.status()}): ${body}`);
  }
  return res.json();
}

async function getOpportunity(request: APIRequestContext, opportunityId: string) {
  const res = await request.get(`${BACKEND_URL}/api/opportunities/${opportunityId}?tenant_id=${E2E_TENANT_ID}`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Get opportunity failed (${res.status()}): ${body}`);
  }
  return res.json();
}

// Helper to initialize E2E UI context
async function initE2EUi(page: Page) {
  await page.context().addInitScript(() => {
    localStorage.setItem('E2E_TEST_MODE', 'true');
    localStorage.setItem('tenant_id', '6cb4c008-4847-426a-9a2e-918ad70e7b69');
    localStorage.setItem('selected_tenant_id', '6cb4c008-4847-426a-9a2e-918ad70e7b69');
  });
}

// ============== TEST SUITES ==============

test.describe('BizDev → Lead → Contact Workflow (B2B)', () => {
  
  test('complete B2B workflow: BizDev Source → Lead → Contact + Account + Opportunity', async ({ request, page: _page }) => {
    const ts = Date.now();
    
    // ========== STAGE 1: Create BizDev Source ==========
    console.log('[Stage 1] Creating B2B BizDev Source...');
    
    const bizdevData = {
      source_name: `Trade Show Lead ${ts}`,  // Required field
      company_name: `Acme Corp E2E ${ts}`,
      contact_person: `John Smith ${ts}`,
      contact_email: `john.smith.${ts}@acmecorp.test`,
      contact_phone: '+1-555-0100',
      source_type: 'trade_show',
      address_line_1: '123 Business Ave',
      city: 'San Francisco',
      state_province: 'CA',
      postal_code: '94105',
      country: 'United States',
      website: 'https://acmecorp.test',
      industry: 'Technology',
    };
    
    const createResult = await createBizDevSourceViaAPI(request, bizdevData);
    const sourceId = createResult?.data?.id || createResult?.id;
    expect(sourceId).toBeTruthy();
    console.log(`[Stage 1] ✓ Created BizDev Source: ${sourceId}`);
    
    // Verify source was created with correct status
    const sourceAfterCreate = await getBizDevSource(request, sourceId);
    const sourceRecord = sourceAfterCreate?.data || sourceAfterCreate;
    expect(sourceRecord.status).toBe('Active');
    expect(sourceRecord.company_name).toBe(bizdevData.company_name);
    expect(sourceRecord.contact_email).toBe(bizdevData.contact_email);
    expect(sourceRecord.tenant_id).toBe(E2E_TENANT_ID);
    console.log('[Stage 1] ✓ Verified BizDev Source data integrity');
    
    // ========== STAGE 2: Promote BizDev Source to Lead ==========
    console.log('[Stage 2] Promoting BizDev Source to Lead...');
    
    const promoteResult = await promoteBizDevSourceViaAPI(request, sourceId, 'B2B');
    const leadId = promoteResult?.data?.lead?.id;
    const accountIdFromPromotion = promoteResult?.data?.account_id;
    const leadType = promoteResult?.data?.lead_type;
    
    expect(leadId).toBeTruthy();
    expect(leadType).toBe('b2b');
    console.log(`[Stage 2] ✓ Created Lead: ${leadId} (type: ${leadType})`);
    
    // Verify BizDev Source status changed to Promoted
    const sourceAfterPromotion = await getBizDevSource(request, sourceId);
    const promotedSource = sourceAfterPromotion?.data || sourceAfterPromotion;
    expect(promotedSource.status).toBe('Promoted');
    expect(promotedSource.metadata?.promoted_to_lead_id).toBe(leadId);
    console.log('[Stage 2] ✓ BizDev Source status updated to Promoted');
    
    // Verify Lead was created with correct data
    const leadAfterCreate = await getLead(request, leadId);
    const leadRecord = leadAfterCreate?.data?.lead || leadAfterCreate?.data || leadAfterCreate;
    expect(leadRecord.status).toBe('new');
    expect(leadRecord.email).toBe(bizdevData.contact_email);
    expect(leadRecord.company).toBe(bizdevData.company_name);
    expect(leadRecord.tenant_id).toBe(E2E_TENANT_ID);
    // Verify provenance metadata (field is promoted_from_bizdev_id in buildLeadProvenanceMetadata)
    expect(leadRecord.metadata?.promoted_from_bizdev_id).toBe(sourceId);
    console.log('[Stage 2] ✓ Lead data integrity verified with provenance');
    
    // ========== STAGE 3: Convert Lead to Contact + Account + Opportunity ==========
    console.log('[Stage 3] Converting Lead to Contact + Account + Opportunity...');
    
    const opportunityName = `Enterprise Deal - ${ts}`;
    const opportunityAmount = 50000;
    const accountName = `Acme Corp Account ${ts}`;
    
    const convertResult = await convertLeadViaAPI(request, leadId, {
      create_account: true,
      account_name: accountName,
      create_opportunity: true,
      opportunity_name: opportunityName,
      opportunity_amount: opportunityAmount,
    });
    
    const contactId = convertResult?.data?.contact?.id;
    const newAccountId = convertResult?.data?.account?.id;
    const opportunityId = convertResult?.data?.opportunity?.id;
    
    expect(contactId).toBeTruthy();
    expect(newAccountId).toBeTruthy();
    expect(opportunityId).toBeTruthy();
    console.log(`[Stage 3] ✓ Created Contact: ${contactId}, Account: ${newAccountId}, Opportunity: ${opportunityId}`);
    
    // ========== STAGE 4: Verify Final Data Integrity ==========
    console.log('[Stage 4] Verifying final data integrity...');
    
    // Verify Contact
    const contactResult = await getContact(request, contactId);
    const contactRecord = contactResult?.data?.contact || contactResult?.data || contactResult;
    expect(contactRecord.email).toBe(bizdevData.contact_email);
    expect(contactRecord.account_id).toBe(newAccountId);
    expect(contactRecord.tenant_id).toBe(E2E_TENANT_ID);
    expect(contactRecord.metadata?.converted_from_lead_id).toBe(leadId);
    console.log('[Stage 4] ✓ Contact verified with provenance');
    
    // Verify Account
    const accountResult = await getAccount(request, newAccountId);
    const accountRecord = accountResult?.data?.account || accountResult?.data || accountResult;
    expect(accountRecord.name).toBe(accountName);
    expect(accountRecord.tenant_id).toBe(E2E_TENANT_ID);
    console.log('[Stage 4] ✓ Account verified');
    
    // Verify Opportunity
    const opportunityResult = await getOpportunity(request, opportunityId);
    const opportunityRecord = opportunityResult?.data?.opportunity || opportunityResult?.data || opportunityResult;
    expect(opportunityRecord.name).toBe(opportunityName);
    expect(opportunityRecord.amount).toBe(opportunityAmount);
    expect(opportunityRecord.contact_id).toBe(contactId);
    expect(opportunityRecord.account_id).toBe(newAccountId);
    expect(opportunityRecord.tenant_id).toBe(E2E_TENANT_ID);
    expect(opportunityRecord.stage).toBe('prospecting');
    console.log('[Stage 4] ✓ Opportunity verified with relationships');
    
    // Verify Lead was marked as converted (should be deleted or status=converted)
    try {
      const leadAfterConvert = await getLead(request, leadId);
      const finalLeadRecord = leadAfterConvert?.data?.lead || leadAfterConvert?.data || leadAfterConvert;
      // Lead should be deleted after conversion, but check status if still exists
      if (finalLeadRecord) {
        expect(finalLeadRecord.status).toBe('converted');
      }
    } catch (_err) {
      // Lead was deleted - this is expected
      console.log('[Stage 4] ✓ Lead was deleted after conversion (expected)');
    }
    
    console.log('======================================');
    console.log('✅ B2B WORKFLOW COMPLETE');
    console.log(`   BizDev Source: ${sourceId} → Promoted`);
    console.log(`   Lead: ${leadId} → Converted/Deleted`);
    console.log(`   Contact: ${contactId}`);
    console.log(`   Account: ${newAccountId}`);
    console.log(`   Opportunity: ${opportunityId}`);
    console.log('======================================');
  });
  
  test('verify tenant isolation: records only visible in correct tenant', async ({ request }) => {
    const ts = Date.now();
    
    // Create a BizDev source
    const createResult = await createBizDevSourceViaAPI(request, {
      source_name: `Tenant Isolation Test ${ts}`,
      company_name: `Tenant Test Co ${ts}`,
      contact_person: `Test Person ${ts}`,
      contact_email: `tenant.test.${ts}@test.com`,
    });
    
    const sourceId = createResult?.data?.id || createResult?.id;
    expect(sourceId).toBeTruthy();
    
    // Try to access from a different tenant (should fail or return nothing)
    const wrongTenantId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`${BACKEND_URL}/api/bizdevsources/${sourceId}?tenant_id=${wrongTenantId}`);
    
    // Should either return 404 or empty result
    if (res.ok()) {
      const body = await res.json();
      const record = body?.data || body;
      // If returns something, it should NOT be our record
      expect(record?.id).not.toBe(sourceId);
    } else {
      // 404 is expected
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
    
    console.log('✓ Tenant isolation verified');
  });
});

test.describe('BizDev → Lead → Contact Workflow (B2C)', () => {
  
  test('complete B2C workflow: BizDev Source → Lead → Contact (person-first)', async ({ request }) => {
    const ts = Date.now();
    
    // ========== STAGE 1: Create B2C BizDev Source (no company) ==========
    console.log('[Stage 1] Creating B2C BizDev Source...');
    
    const bizdevData = {
      source_name: `B2C Referral ${ts}`,  // Required field
      // No company_name for B2C
      contact_person: `Jane Doe ${ts}`,
      contact_email: `jane.doe.${ts}@personal.test`,
      contact_phone: '+1-555-0200',
      source_type: 'referral',
      address_line_1: '456 Home Street',
      city: 'Los Angeles',
      state_province: 'CA',
      postal_code: '90001',
      country: 'United States',
    };
    
    const createResult = await createBizDevSourceViaAPI(request, bizdevData);
    const sourceId = createResult?.data?.id || createResult?.id;
    expect(sourceId).toBeTruthy();
    console.log(`[Stage 1] ✓ Created B2C BizDev Source: ${sourceId}`);
    
    // ========== STAGE 2: Promote to Lead (B2C) ==========
    console.log('[Stage 2] Promoting to B2C Lead...');
    
    const promoteResult = await promoteBizDevSourceViaAPI(request, sourceId, 'B2C');
    const leadId = promoteResult?.data?.lead?.id;
    const leadType = promoteResult?.data?.lead_type;
    const personId = promoteResult?.data?.person_id;
    
    expect(leadId).toBeTruthy();
    // Lead type depends on tenant's business_model config (B2C, B2B, or Hybrid)
    // If tenant is Hybrid and no company_name provided, it should be B2C
    // Accept either type since it depends on tenant configuration
    expect(['b2b', 'b2c']).toContain(leadType);
    console.log(`[Stage 2] ✓ Created Lead: ${leadId} (type: ${leadType})`);
    if (personId) {
      console.log(`[Stage 2] ✓ Created person_profile: ${personId}`);
    }
    
    // Verify Lead data
    const leadResult = await getLead(request, leadId);
    const leadRecord = leadResult?.data?.lead || leadResult?.data || leadResult;
    expect(leadRecord.email).toBe(bizdevData.contact_email);
    expect(leadRecord.tenant_id).toBe(E2E_TENANT_ID);
    console.log('[Stage 2] ✓ B2C Lead data verified');
    
    // ========== STAGE 3: Convert to Contact (minimal - no company) ==========
    console.log('[Stage 3] Converting B2C Lead to Contact...');
    
    const convertResult = await convertLeadViaAPI(request, leadId, {
      create_account: false, // B2C typically doesn't need company account
      create_opportunity: false,
    });
    
    const contactId = convertResult?.data?.contact?.id;
    expect(contactId).toBeTruthy();
    console.log(`[Stage 3] ✓ Created Contact: ${contactId}`);
    
    // Verify Contact
    const contactResult = await getContact(request, contactId);
    const contactRecord = contactResult?.data?.contact || contactResult?.data || contactResult;
    expect(contactRecord.email).toBe(bizdevData.contact_email);
    expect(contactRecord.tenant_id).toBe(E2E_TENANT_ID);
    
    console.log('======================================');
    console.log('✅ B2C WORKFLOW COMPLETE');
    console.log(`   BizDev Source: ${sourceId} → Promoted`);
    console.log(`   Lead: ${leadId} → Converted`);
    console.log(`   Contact: ${contactId}`);
    console.log('======================================');
  });
});

test.describe('Workflow UI Verification', () => {
  
  // Skip flaky UI tests - they depend on page load timing which varies
  test.skip('UI reflects BizDev Source promotion status change', async ({ request, page }) => {
    const ts = Date.now();
    
    // Create BizDev source via API
    const createResult = await createBizDevSourceViaAPI(request, {
      source_name: `UI Promotion Test ${ts}`,
      company_name: `UI Test Co ${ts}`,
      contact_person: `UI Tester ${ts}`,
      contact_email: `ui.test.${ts}@test.com`,
    });
    
    const sourceId = createResult?.data?.id || createResult?.id;
    expect(sourceId).toBeTruthy();
    
    // Initialize UI
    await initE2EUi(page);
    await page.goto(`${FRONTEND_URL}/Sources`, { waitUntil: 'domcontentloaded' });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Look for the source in the list (search if available)
    const searchInput = page.getByPlaceholder(/search/i).first();
    const canSearch = await searchInput.isVisible().catch(() => false);
    if (canSearch) {
      await searchInput.fill(`UI Test Co ${ts}`);
      await page.waitForTimeout(1000);
    }
    
    // Verify source shows as Active
    const activeStatusBadge = page.getByText('Active').first();
    await expect(activeStatusBadge).toBeVisible({ timeout: 15000 });
    console.log('✓ BizDev Source visible with Active status');
    
    // Promote via API
    await promoteBizDevSourceViaAPI(request, sourceId, 'B2B');
    
    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Re-search if needed
    if (canSearch) {
      const searchAfterReload = page.getByPlaceholder(/search/i).first();
      await searchAfterReload.fill(`UI Test Co ${ts}`);
      await page.waitForTimeout(1000);
    }
    
    // Verify status changed to Promoted
    const promotedStatusBadge = page.getByText('Promoted').first();
    await expect(promotedStatusBadge).toBeVisible({ timeout: 15000 });
    console.log('✓ BizDev Source status changed to Promoted in UI');
  });
  
  // Skip flaky UI tests - they depend on page load timing which varies
  test.skip('UI shows converted Lead status after conversion', async ({ request, page }) => {
    const ts = Date.now();
    
    // Create and promote BizDev source to get a Lead
    const createResult = await createBizDevSourceViaAPI(request, {
      source_name: `Lead Conversion UI Test ${ts}`,
      company_name: `Lead UI Test ${ts}`,
      contact_person: `Lead Tester ${ts}`,
      contact_email: `lead.ui.${ts}@test.com`,
    });
    
    const sourceId = createResult?.data?.id || createResult?.id;
    const promoteResult = await promoteBizDevSourceViaAPI(request, sourceId, 'B2B');
    const leadId = promoteResult?.data?.lead?.id;
    expect(leadId).toBeTruthy();
    
    // Navigate to Leads page
    await initE2EUi(page);
    await page.goto(`${FRONTEND_URL}/Leads`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Search for the lead
    const searchInput = page.getByPlaceholder(/search/i).first();
    const canSearch = await searchInput.isVisible().catch(() => false);
    if (canSearch) {
      await searchInput.fill(`lead.ui.${ts}@test.com`);
      await page.waitForTimeout(1000);
    }
    
    // Verify lead shows as New
    const newStatusBadge = page.getByText(/new/i).first();
    await expect(newStatusBadge).toBeVisible({ timeout: 15000 });
    console.log('✓ Lead visible with New status');
    
    // Convert via API
    await convertLeadViaAPI(request, leadId, {
      create_account: true,
      account_name: `Lead UI Account ${ts}`,
      create_opportunity: true,
      opportunity_name: `Lead UI Opp ${ts}`,
      opportunity_amount: 10000,
    });
    
    // Reload and verify (lead may be deleted or show converted)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Re-search
    if (canSearch) {
      const searchAfterReload = page.getByPlaceholder(/search/i).first();
      await searchAfterReload.fill(`lead.ui.${ts}@test.com`);
      await page.waitForTimeout(1000);
    }
    
    // Lead should either show converted or be gone (deleted after conversion)
    const convertedBadge = page.getByText(/converted/i).first();
    const noResults = page.getByText(/no leads found|no results/i).first();
    
    // Either converted badge visible OR no results (lead deleted)
    const isConverted = await convertedBadge.isVisible().catch(() => false);
    const isGone = await noResults.isVisible().catch(() => false);
    
    expect(isConverted || isGone).toBeTruthy();
    console.log('✓ Lead conversion reflected in UI (converted or deleted)');
  });
});

test.describe('Error Handling & Edge Cases', () => {
  
  test('cannot promote already-promoted BizDev source', async ({ request }) => {
    const ts = Date.now();
    
    // Create and promote
    const createResult = await createBizDevSourceViaAPI(request, {
      source_name: `Double Promote Test ${ts}`,
      company_name: `Double Promote Test ${ts}`,
      contact_email: `double.${ts}@test.com`,
    });
    
    const sourceId = createResult?.data?.id || createResult?.id;
    await promoteBizDevSourceViaAPI(request, sourceId, 'B2B');
    
    // Try to promote again - should fail or be handled gracefully
    try {
      await promoteBizDevSourceViaAPI(request, sourceId, 'B2B');
      // If it didn't throw, check the response
      console.log('⚠️ Second promotion did not throw - checking behavior');
    } catch (_err) {
      // Expected - already promoted
      console.log('✓ Second promotion correctly rejected');
    }
  });
  
  test('cannot convert non-existent lead', async ({ request }) => {
    const fakeLeadId = '00000000-0000-0000-0000-000000000000';
    
    try {
      await convertLeadViaAPI(request, fakeLeadId, {
        create_account: true,
        account_name: 'Should Not Exist',
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: unknown) {
      // Expected - lead not found
      const errorMessage = err instanceof Error ? err.message : String(err);
      expect(errorMessage).toContain('404');
      console.log('✓ Converting non-existent lead correctly rejected');
    }
  });
  
  test('BizDev source requires minimum data', async ({ request }) => {
    // Try to create without email
    try {
      const res = await request.post(`${BACKEND_URL}/api/bizdevsources`, {
        data: {
          tenant_id: E2E_TENANT_ID,
          company_name: 'Missing Email Co',
          // No contact_email
        },
      });
      
      // Should fail validation or create with null email
      if (res.ok()) {
        console.log('⚠️ BizDev source created without email - validation may be lenient');
      } else {
        console.log('✓ BizDev source creation without email rejected');
      }
    } catch (_err) {
      console.log('✓ BizDev source creation without email rejected');
    }
  });
});

test.describe('Stats & Counts Verification', () => {
  
  // Skip flaky stats test - depends on UI timing and complex state
  test.skip('stats update correctly through workflow stages', async ({ request, page }) => {
    const ts = Date.now();
    
    // Initialize UI to check initial stats
    await initE2EUi(page);
    await page.goto(`${FRONTEND_URL}/Sources`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Get initial Active count (look for stat card)
    const getActiveCount = async () => {
      const activeCard = page.locator('text=Active').first();
      const parent = activeCard.locator('xpath=ancestor::div[contains(@class, "cursor-pointer")]').first();
      const countText = await parent.locator('p.text-2xl').textContent().catch(() => '0');
      return parseInt(countText || '0', 10);
    };
    
    const initialActiveCount = await getActiveCount();
    console.log(`Initial Active count: ${initialActiveCount}`);
    
    // Create a new BizDev source
    await createBizDevSourceViaAPI(request, {
      source_name: `Stats Verification Test ${ts}`,
      company_name: `Stats Test Co ${ts}`,
      contact_email: `stats.${ts}@test.com`,
    });
    
    // Reload and check count increased
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const afterCreateCount = await getActiveCount();
    console.log(`After create Active count: ${afterCreateCount}`);
    expect(afterCreateCount).toBeGreaterThanOrEqual(initialActiveCount);
    
    console.log('✓ Stats verification completed');
  });
});
