// Validate Notes CRUD via Braid
// Usage: node scripts/validate_braid_notes_crud.js [tenantSlug]

import { executeBraidTool } from '../lib/braidIntegration-v2.js';

const tenantSlug = process.argv[2] || 'labor-depot';
const tenantRecord = { tenant_id: tenantSlug };

function ok(res) { return res && res.tag === 'Ok'; }
function errStr(res) { return res?.error?.message || JSON.stringify(res?.error || res); }
function logStep(name, status, detail = '') { const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️'; console.log(`${icon} ${name}: ${status}${detail ? ' - ' + detail : ''}`); }

async function run() {
  console.log(`\n🧪 Notes CRUD Validation via Braid for tenant: ${tenantSlug}\n`);

  let accountId = null;
  let noteId = null;

  // 1) Create a temporary Account to attach notes to
  {
    const args = {
      tenant: tenantSlug,
      name: `NotesTest ${Date.now()}`,
      industry: 'Software',
      annual_revenue: 12345,
      website: 'https://example.com',
      assigned_to: ''
    };
    const res = await executeBraidTool('create_account', args, tenantRecord, null);
    if (ok(res) && res.value?.id) { accountId = res.value.id; logStep('create_account', 'PASS', `id=${accountId}`); }
    else { logStep('create_account', 'FAIL', errStr(res)); process.exit(1); }
  }

  // 2) Create Note related to the Account
  {
    const args = {
      tenant: tenantSlug,
      title: 'Initial Note',
      content: 'This is a test note created via Braid.',
      assigned_to: '',
      related_to_type: 'account',
      related_to_id: accountId
    };
    const res = await executeBraidTool('create_note', args, tenantRecord, null);
    if (ok(res) && res.value?.note?.id) { noteId = res.value.note.id; logStep('create_note', 'PASS', `id=${noteId}`); }
    else { logStep('create_note', 'FAIL', errStr(res)); cleanup(accountId, null); }
  }

  // 3) Update Note content
  {
    const args = { tenant: tenantSlug, note_id: noteId, updates: { content: 'Updated note content.' } };
    const res = await executeBraidTool('update_note', args, tenantRecord, null);
    if (ok(res) && res.value?.note?.content === 'Updated note content.') { logStep('update_note', 'PASS'); }
    else { logStep('update_note', 'FAIL', errStr(res)); await cleanup(accountId, noteId); process.exit(1); }
  }

  // 4) Get notes for record and ensure our note is present
  {
    const args = { tenant: tenantSlug, related_to_type: 'account', related_to_id: accountId };
    const res = await executeBraidTool('get_notes_for_record', args, tenantRecord, null);
    if (ok(res) && Array.isArray(res.value?.notes) && res.value.notes.some(n => n.id === noteId)) {
      logStep('get_notes_for_record', 'PASS', `found note ${noteId}`);
    } else {
      logStep('get_notes_for_record', 'FAIL', errStr(res));
      await cleanup(accountId, noteId);
      process.exit(1);
    }
  }

  // 5) Delete Note
  {
    const res = await executeBraidTool('delete_note', { tenant: tenantSlug, note_id: noteId }, tenantRecord, null);
    if (ok(res) && res.value === true) { logStep('delete_note', 'PASS'); }
    else { logStep('delete_note', 'FAIL', errStr(res)); await cleanup(accountId, null); process.exit(1); }
  }

  // Cleanup: delete the temporary Account
  await cleanup(accountId, null);

  console.log('\n✨ Notes CRUD validation completed successfully');
}

async function cleanup(accountId, noteId) {
  try {
    if (noteId) {
      await executeBraidTool('delete_note', { tenant: tenantSlug, note_id: noteId }, tenantRecord, null);
    }
  } catch (e) { void e; }
  try {
    if (accountId) {
      await executeBraidTool('delete_account', { tenant: tenantSlug, account_id: accountId }, tenantRecord, null);
    }
  } catch (e) { void e; }
}

run().catch((e) => { console.error('Unexpected error during notes CRUD validation:', e); process.exit(1); });
