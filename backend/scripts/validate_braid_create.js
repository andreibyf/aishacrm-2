// Validate create flows for Accounts, Leads, Contacts, Opportunities via Braid
// Usage: node scripts/validate_braid_create.js [tenantSlug]

import { executeBraidTool } from '../lib/braidIntegration-v2.js';

const tenantSlug = process.argv[2] || 'labor-depot';
const tenantRecord = { tenant_id: tenantSlug };

function ok(res) { return res && res.tag === 'Ok'; }
function errStr(res) { return res?.error?.message || JSON.stringify(res?.error || res); }
function logStep(name, status, detail = '') { const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️'; console.log(`${icon} ${name}: ${status}${detail ? ' - ' + detail : ''}`); }

async function run() {
  console.log(`\n🧪 Create Validation via Braid for tenant: ${tenantSlug}\n`);

  let accountId = null;
  let leadId = null;
  let contactId = null;
  let opportunityId = null;

  // 1) Create Account
  {
    const args = {
      tenant: tenantSlug,
      name: `Create Test ${Date.now()}`,
      industry: 'Software',
      annual_revenue: 1000000,
      website: 'https://example.com',
      assigned_to: ''
    };
    const res = await executeBraidTool('create_account', args, tenantRecord, null);
    if (ok(res) && res.value?.id) { accountId = res.value.id; logStep('create_account', 'PASS', `id=${accountId}`); }
    else { logStep('create_account', 'FAIL', errStr(res)); process.exit(1); }
  }

  // 2) Create Lead
  {
    const args = {
      tenant: tenantSlug,
      first_name: 'Test',
      last_name: 'Lead',
      email: `lead_${Date.now()}@example.com`,
      company: 'Example Co',
      phone: '555-0100',
      source: 'web'
    };
    const res = await executeBraidTool('create_lead', args, tenantRecord, null);
    if (ok(res) && res.value?.id) { leadId = res.value.id; logStep('create_lead', 'PASS', `id=${leadId}`); }
    else { logStep('create_lead', 'FAIL', errStr(res)); process.exit(1); }
  }

  // 3) Create Contact (linked to account)
  {
    const args = {
      tenant: tenantSlug,
      first_name: 'Test',
      last_name: 'Contact',
      email: `contact_${Date.now()}@example.com`,
      phone: '555-0200',
      job_title: 'Engineer',
      account_id: accountId,
      assigned_to: ''
    };
    const res = await executeBraidTool('create_contact', args, tenantRecord, null);
    if (ok(res) && res.value?.id) { contactId = res.value.id; logStep('create_contact', 'PASS', `id=${contactId}`); }
    else { logStep('create_contact', 'FAIL', errStr(res)); process.exit(1); }
  }

  // 4) Create Opportunity (linked to account)
  {
    const args = {
      tenant: tenantSlug,
      name: `Opp ${Date.now()}`,
      account_id: accountId,
      amount: 25000,
      stage: 'prospecting',
      close_date: new Date().toISOString().slice(0,10),
      probability: 10,
      assigned_to: ''
    };
    const res = await executeBraidTool('create_opportunity', args, tenantRecord, null);
    if (ok(res) && res.value?.id) { opportunityId = res.value.id; logStep('create_opportunity', 'PASS', `id=${opportunityId}`); }
    else { logStep('create_opportunity', 'FAIL', errStr(res)); process.exit(1); }
  }

  // Cleanup in reverse order
  {
    const resOpp = await executeBraidTool('delete_opportunity', { tenant: tenantSlug, opportunity_id: opportunityId }, tenantRecord, null);
    if (ok(resOpp) && resOpp.value === true) logStep('delete_opportunity', 'PASS'); else logStep('delete_opportunity', 'FAIL', errStr(resOpp));

    const resContact = await executeBraidTool('delete_contact', { tenant: tenantSlug, contact_id: contactId }, tenantRecord, null);
    if (ok(resContact) && resContact.value === true) logStep('delete_contact', 'PASS'); else logStep('delete_contact', 'FAIL', errStr(resContact));

    const resLead = await executeBraidTool('delete_lead', { tenant: tenantSlug, lead_id: leadId }, tenantRecord, null);
    if (ok(resLead) && resLead.value === true) logStep('delete_lead', 'PASS'); else logStep('delete_lead', 'FAIL', errStr(resLead));

    const resAcct = await executeBraidTool('delete_account', { tenant: tenantSlug, account_id: accountId }, tenantRecord, null);
    if (ok(resAcct) && resAcct.value === true) logStep('delete_account', 'PASS'); else logStep('delete_account', 'FAIL', errStr(resAcct));
  }

  console.log('\n✨ Create validation completed successfully');
}

run().catch((e) => { console.error('Unexpected error during create validation:', e); process.exit(1); });
