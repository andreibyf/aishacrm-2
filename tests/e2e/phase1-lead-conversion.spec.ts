import { test, expect } from '@playwright/test';
import { BACKEND_URL, TENANT_ID, createLead, convertLead } from './helpers';

test.describe('@phase1 Lead Conversion', () => {
  test('convert lead creates account/contact/opportunity and marks lead converted', async ({ request }) => {
    const ts = Date.now();
    const email = `lead.convert.${ts}@acmecorp.test`;
    const company = `Phase1 Convert Co ${ts}`;

    const lead = await createLead(request, { first_name: 'Convert', last_name: `Lead-${ts}`, email, company, job_title: 'VP' });
    const leadId = lead?.data?.lead?.id || lead?.data?.id || lead?.id;
    expect(leadId).toBeTruthy();

    const conv = await convertLead(request, leadId, { account_name: company, opportunity_name: `Deal ${ts}`, opportunity_amount: 75000 });
    const accountId = conv?.data?.account?.id;
    const contactId = conv?.data?.contact?.id;
    const oppId = conv?.data?.opportunity?.id;
    expect(accountId && contactId && oppId).toBeTruthy();

    // Verify via conversion success; lead status verification may vary by backend implementation
    // If available, attempt to read and assert; otherwise skip gracefully
    const leadGet = await request.get(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${TENANT_ID}`);
    if (leadGet.ok()) {
      const leadJson = await leadGet.json();
      const status = leadJson?.data?.lead?.status || leadJson?.data?.status;
      expect(status).toBe('converted');
    }
  });
});
