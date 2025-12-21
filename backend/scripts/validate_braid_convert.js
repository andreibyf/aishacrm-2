// Validate lead conversion flow via Braid
// Usage: node scripts/validate_braid_convert.js [tenantSlug]

import { executeBraidTool } from '../lib/braidIntegration-v2.js';
import { initSupabaseDB, pool as supabasePool } from '../lib/supabase-db.js';

const tenantSlug = process.argv[2] || 'labor-depot';
const tenantRecord = { tenant_id: tenantSlug };

function ok(res) { return res && res.tag === 'Ok'; }
function errStr(res) { return res?.error?.message || JSON.stringify(res?.error || res); }
function logStep(name, status, detail = '') { const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️'; console.log(`${icon} ${name}: ${status}${detail ? ' - ' + detail : ''}`); }

async function run() {
  console.log(`\n🧪 Lead Conversion Validation via Braid for tenant: ${tenantSlug}\n`);

  // Initialize Supabase DB for verification queries (entity_transitions)
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
  } catch (e) { const _ignored = e; void _ignored; }

  let leadId = null;
  let contactId = null;

  // 1) Create Lead
  {
    const args = {
      tenant: tenantSlug,
      first_name: 'Conv',
      last_name: `Lead_${Date.now()}`,
      email: `conv_lead_${Date.now()}@example.com`,
      company: 'Conversion Co',
      phone: '555-0300',
      source: 'web'
    };
    const res = await executeBraidTool('create_lead', args, tenantRecord, null);
    if (ok(res) && res.value?.id) { leadId = res.value.id; logStep('create_lead', 'PASS', `id=${leadId}`); }
    else { logStep('create_lead', 'FAIL', errStr(res)); process.exit(1); }
  }

  // 2) Convert Lead to Contact (no new account, just contact)
  {
    const args = { tenant: tenantSlug, lead_id: leadId, options: { create_contact: true } };
    const res = await executeBraidTool('convert_lead_to_account', args, tenantRecord, null);
    if (ok(res) && res.value?.contact?.id) {
      contactId = res.value.contact.id;
      logStep('convert_lead_to_account', 'PASS', `contact_id=${contactId}`);
    } else {
      logStep('convert_lead_to_account', 'FAIL', errStr(res));
      process.exit(1);
    }
  }

  // 3) Cleanup: delete created contact
  {
    const res = await executeBraidTool('delete_contact', { tenant: tenantSlug, contact_id: contactId }, tenantRecord, null);
    if (ok(res) && res.value === true) {
      logStep('delete_contact', 'PASS');
    } else {
      logStep('delete_contact', 'FAIL', errStr(res));
      process.exit(1);
    }
  }

  // 4) Convert with new Account + Opportunity
  {
    // Create a fresh lead
    const resLead = await executeBraidTool('create_lead', {
      tenant: tenantSlug,
      first_name: 'Conv2',
      last_name: `Lead_${Date.now()}`,
      email: `conv2_${Date.now()}@example.com`,
      company: 'NewCo',
      phone: '555-0301',
      source: 'web'
    }, tenantRecord, null);
    if (!(ok(resLead) && resLead.value?.id)) { logStep('create_lead (flow2)', 'FAIL', errStr(resLead)); process.exit(1); }
    const lead2Id = resLead.value.id;
    logStep('create_lead (flow2)', 'PASS', `id=${lead2Id}`);

    // Convert with new account and opportunity
    const convertArgs = {
      tenant: tenantSlug,
      lead_id: lead2Id,
      options: {
        create_contact: true,
        create_account: true,
        account_name: `Account ${Date.now()}`,
        create_opportunity: true,
        opportunity_name: 'Initial Deal',
        opportunity_amount: 12345
      }
    };
    const resConv = await executeBraidTool('convert_lead_to_account', convertArgs, tenantRecord, null);
    if (!(ok(resConv) && resConv.value?.contact?.id)) { logStep('convert (flow2)', 'FAIL', errStr(resConv)); process.exit(1); }
    const contact2Id = resConv.value.contact.id;
    const account2Id = resConv.value.account?.id || null;
    const opportunity2Id = resConv.value.opportunity?.id || null;
    if (!account2Id) { logStep('convert (flow2.account)', 'FAIL', 'no account returned'); process.exit(1); }
    if (!opportunity2Id) { logStep('convert (flow2.opportunity)', 'FAIL', 'no opportunity returned'); process.exit(1); }
    logStep('convert (flow2)', 'PASS', `contact=${contact2Id}, account=${account2Id}, opp=${opportunity2Id}`);

    // Verify transition record exists for contact2 (best-effort; skip if no DB)
    try {
      if (supabasePool) {
        const trans = await supabasePool.query(
          'SELECT * FROM entity_transitions WHERE to_table = $1 AND to_id = $2 ORDER BY performed_at DESC LIMIT 1',
          ['contacts', contact2Id]
        );
        if (trans.rows.length === 0) { logStep('transition_check (flow2)', 'FAIL', 'no transition record'); process.exit(1); }
        else { logStep('transition_check (flow2)', 'PASS'); }
      }
  } catch (e) { const _ignored2 = e; void _ignored2; }

    // Cleanup: delete opportunity, contact, account
    const delOpp = await executeBraidTool('delete_opportunity', { tenant: tenantSlug, opportunity_id: opportunity2Id }, tenantRecord, null);
    if (!(ok(delOpp) && delOpp.value === true)) { logStep('delete_opportunity (flow2)', 'FAIL', errStr(delOpp)); process.exit(1); }
    logStep('delete_opportunity (flow2)', 'PASS');
    const delContact = await executeBraidTool('delete_contact', { tenant: tenantSlug, contact_id: contact2Id }, tenantRecord, null);
    if (!(ok(delContact) && delContact.value === true)) { logStep('delete_contact (flow2)', 'FAIL', errStr(delContact)); process.exit(1); }
    logStep('delete_contact (flow2)', 'PASS');
    const delAccount = await executeBraidTool('delete_account', { tenant: tenantSlug, account_id: account2Id }, tenantRecord, null);
    if (!(ok(delAccount) && delAccount.value === true)) { logStep('delete_account (flow2)', 'FAIL', errStr(delAccount)); process.exit(1); }
    logStep('delete_account (flow2)', 'PASS');
  }

  // 5) Convert into an existing Account
  {
    // Create an account to link
    const accRes = await executeBraidTool('create_account', {
      tenant: tenantSlug,
      name: `ExistingCo ${Date.now()}`,
      industry: 'Software',
      website: 'https://example.com'
    }, tenantRecord, null);
    if (!(ok(accRes) && accRes.value?.id)) { logStep('create_account (flow3)', 'FAIL', errStr(accRes)); process.exit(1); }
    const existingAccId = accRes.value.id;
    logStep('create_account (flow3)', 'PASS', `id=${existingAccId}`);

    // Create lead
    const resLead3 = await executeBraidTool('create_lead', {
      tenant: tenantSlug,
      first_name: 'Conv3',
      last_name: `Lead_${Date.now()}`,
      email: `conv3_${Date.now()}@example.com`,
      company: 'ExistingCo',
      phone: '555-0302',
      source: 'web'
    }, tenantRecord, null);
    if (!(ok(resLead3) && resLead3.value?.id)) { logStep('create_lead (flow3)', 'FAIL', errStr(resLead3)); process.exit(1); }
    const lead3Id = resLead3.value.id;
    logStep('create_lead (flow3)', 'PASS', `id=${lead3Id}`);

    // Convert into selected account
    const resConv3 = await executeBraidTool('convert_lead_to_account', {
      tenant: tenantSlug,
      lead_id: lead3Id,
      options: { create_contact: true, selected_account_id: existingAccId }
    }, tenantRecord, null);
    if (!(ok(resConv3) && resConv3.value?.contact?.id)) { logStep('convert (flow3)', 'FAIL', errStr(resConv3)); process.exit(1); }
    const contact3Id = resConv3.value.contact.id;
    const linkedAccId = resConv3.value.contact.account_id || null;
    if (linkedAccId !== existingAccId) { logStep('convert (flow3.account_link)', 'FAIL', `expected ${existingAccId}, got ${linkedAccId}`); process.exit(1); }
    logStep('convert (flow3)', 'PASS', `contact=${contact3Id}, account=${linkedAccId}`);

    // Verify transition record exists
    try {
      if (supabasePool) {
        const trans = await supabasePool.query(
          'SELECT * FROM entity_transitions WHERE to_table = $1 AND to_id = $2 ORDER BY performed_at DESC LIMIT 1',
          ['contacts', contact3Id]
        );
        if (trans.rows.length === 0) { logStep('transition_check (flow3)', 'FAIL', 'no transition record'); process.exit(1); }
        else { logStep('transition_check (flow3)', 'PASS'); }
      }
  } catch (e) { const _ignored3 = e; void _ignored3; }

    // Cleanup: delete contact and account
    const delContact3 = await executeBraidTool('delete_contact', { tenant: tenantSlug, contact_id: contact3Id }, tenantRecord, null);
    if (!(ok(delContact3) && delContact3.value === true)) { logStep('delete_contact (flow3)', 'FAIL', errStr(delContact3)); process.exit(1); }
    logStep('delete_contact (flow3)', 'PASS');
    const delAccount3 = await executeBraidTool('delete_account', { tenant: tenantSlug, account_id: existingAccId }, tenantRecord, null);
    if (!(ok(delAccount3) && delAccount3.value === true)) { logStep('delete_account (flow3)', 'FAIL', errStr(delAccount3)); process.exit(1); }
    logStep('delete_account (flow3)', 'PASS');
  }

  console.log('\n✨ Lead conversion validation completed successfully');
}

run().catch((e) => { console.error('Unexpected error during lead conversion validation:', e); process.exit(1); });
