import { test, expect } from '@playwright/test';
import { createLead, convertLead, updateOpportunityStage, BACKEND_URL, TENANT_ID, navigate, initE2EUi } from './helpers';

test.describe('@phase1 Opportunity Stages', () => {
  test('progress stages and verify persistence and UI reflection', async ({ request, page }) => {
    const ts = Date.now();
    const email = `stages.${ts}@acmecorp.test`;
    const company = `Stages Co ${ts}`;
    const lead = await createLead(request, { first_name: 'Stages', last_name: `Lead-${ts}`, email, company });
    const leadId = lead?.data?.lead?.id || lead?.data?.id || lead?.id;
    const oppName = `Stage Deal ${ts}`;
    const conv = await convertLead(request, leadId, { account_name: company, opportunity_name: oppName, opportunity_amount: 75000 });
    const oppId = conv?.data?.opportunity?.id;
    expect(oppId).toBeTruthy();

    for (const stage of ['qualification','proposal','negotiation','closed_won']) {
      await updateOpportunityStage(request, oppId, stage);
      const get = await request.get(`${BACKEND_URL}/api/opportunities/${oppId}?tenant_id=${TENANT_ID}`);
      const json = await get.json();
      const current = json?.data?.opportunity?.stage || json?.data?.stage;
      expect(current).toBe(stage);
    }

    // UI reflect
    await initE2EUi(page);
    await navigate(page, '/Opportunities');
    await page.waitForTimeout(1500);
    const search = page.getByPlaceholder(/search opportunities/i).first();
    const canSearch = await search.isVisible().catch(()=>false);
    if (canSearch) {
      await search.fill(oppName);
      await page.waitForTimeout(800);
    }
    await expect(page.getByText(oppName).first()).toBeVisible({ timeout: 15000 });
  });
});
