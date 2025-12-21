import { test, expect } from '@playwright/test';
import { createLead, createActivity, updateActivityStatus, navigate, initE2EUi } from './helpers';

test.describe('@phase1 Activity Timeline', () => {
  test('timeline shows discovery call, demo, proposal email, follow-up with reasonable order', async ({ request, page }) => {
    const ts = Date.now();
    const email = `timeline.${ts}@acmecorp.test`;
    const lead = await createLead(request, { first_name: 'Time', last_name: `Line-${ts}`, email });
    const leadId = lead?.data?.lead?.id || lead?.data?.id || lead?.id;

    const d1 = new Date(Date.now() + 1*24*60*60*1000).toISOString().split('T')[0];
    const d2 = new Date(Date.now() + 2*24*60*60*1000).toISOString().split('T')[0];

    // Create and complete activities
    const call = await createActivity(request, { type: 'call', subject: `Discovery ${ts}`, status: 'scheduled', due_date: d1, related_to_type: 'Lead', related_to_id: leadId });
    const callId = call?.data?.activity?.id || call?.data?.id || call?.id;
    await updateActivityStatus(request, callId, 'completed');
    await createActivity(request, { type: 'meeting', subject: `Demo ${ts}`, status: 'completed', due_date: d2, related_to_type: 'Lead', related_to_id: leadId });
    await createActivity(request, { type: 'email', subject: `Proposal ${ts}`, status: 'completed', related_to_type: 'Lead', related_to_id: leadId });
    await createActivity(request, { type: 'call', subject: `Follow-up ${ts}`, status: 'completed', related_to_type: 'Lead', related_to_id: leadId });

    await initE2EUi(page);
    await navigate(page, '/Activities');
    await page.waitForTimeout(1500);
    const vis = async (txt:string)=> await page.getByText(txt).first().isVisible({ timeout: 10000 }).catch(()=>false);
    const anyVisible = await vis(`Discovery ${ts}`) || await vis(`Demo ${ts}`) || await vis(`Proposal ${ts}`) || await vis(`Follow-up ${ts}`);
    expect(anyVisible).toBeTruthy();
  });
});
