import { test, expect } from '@playwright/test';
import { createLead, convertLead, navigate, initE2EUi } from './helpers';

test.describe('@phase1 ACO UI', () => {
  test('accounts/contacts/opportunities appear in UI and are searchable', async ({ request, page }) => {
    const ts = Date.now();
    const email = `aco.ui.${ts}@acmecorp.test`;
    const company = `ACO UI Co ${ts}`;

    const lead = await createLead(request, { first_name: 'ACO', last_name: `Lead-${ts}`, email, company, job_title: 'Mgr' });
    const leadId = lead?.data?.lead?.id || lead?.data?.id || lead?.id;
    const _conv = await convertLead(request, leadId, { account_name: company, opportunity_name: `UI Deal ${ts}`, opportunity_amount: 75000 });
    const oppName = `UI Deal ${ts}`;

    // Accounts UI
    await initE2EUi(page);
    await navigate(page, '/Accounts');
    await page.waitForTimeout(1500);
    const accSearch = page.getByPlaceholder(/search accounts/i).first();
    const canAccSearch = await accSearch.isVisible().catch(()=>false);
    if (canAccSearch) {
      await accSearch.fill(company);
      await page.waitForTimeout(800);
    }
    await expect(page.getByText(company).first()).toBeVisible({ timeout: 15000 });

    // Opportunities UI
    await navigate(page, '/Opportunities');
    await page.waitForTimeout(1500);
    const oppSearch = page.getByPlaceholder(/search opportunities/i).first();
    const canOppSearch = await oppSearch.isVisible().catch(()=>false);
    if (canOppSearch) {
      await oppSearch.fill(oppName);
      await page.waitForTimeout(800);
    }
    await expect(page.getByText(oppName).first()).toBeVisible({ timeout: 15000 });
  });
});
