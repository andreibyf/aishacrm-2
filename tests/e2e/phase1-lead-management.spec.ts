import { test, expect } from '@playwright/test';
import { BACKEND_URL, TENANT_ID, FRONTEND_URL as _FRONTEND_URL, createLead, navigate, initE2EUi } from './helpers';

test.describe('@phase1 Lead Management', () => {
  test('create lead via API, verify status=new, appears in UI and searchable', async ({ request, page }) => {
    const ts = Date.now();
    const email = `lead.phase1.${ts}@acmecorp.test`;

    const res = await createLead(request, {
      first_name: 'Phase1',
      last_name: `Lead-${ts}`,
      email,
      phone: '+1-555-1100',
      company: `Phase1 Co ${ts}`,
      job_title: 'Manager',
      source: 'website',
    });

    const leadId = res?.data?.lead?.id || res?.data?.id || res?.id;
    expect(leadId).toBeTruthy();

    // Verify status=new via API read
    const getLead = await request.get(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${TENANT_ID}`);
    expect(getLead.ok()).toBeTruthy();
    const leadJson = await getLead.json();
    const status = leadJson?.data?.lead?.status || leadJson?.data?.status;
    expect(status).toBe('new');

    // Verify essential fields integrity
    const leadRecord = leadJson?.data?.lead || leadJson?.data;
    expect(leadRecord.first_name).toBeTruthy();
    expect(leadRecord.last_name).toBeTruthy();
    expect(leadRecord.email).toBe(email);

    // UI: navigate to Leads and search by email
    await initE2EUi(page);
    await navigate(page, '/Leads');
    const search = page.getByPlaceholder(/search leads/i).first();
    const canSearch = await search.isVisible().catch(()=>false);
    if (canSearch) {
      await search.fill(email);
      await page.waitForTimeout(1000);
    }
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15000 });
  });
});
