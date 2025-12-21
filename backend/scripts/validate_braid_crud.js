// Validate CRUD flows using Braid tools
// Usage: node scripts/validate_braid_crud.js [tenantSlug]

import { executeBraidTool } from '../lib/braidIntegration-v2.js';

const tenantSlug = process.argv[2] || 'labor-depot';
const tenantRecord = { tenant_id: tenantSlug };

function logStep(name, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
  console.log(`${icon} ${name}: ${status}${detail ? ' - ' + detail : ''}`);
}

async function run() {
  console.log(`\n🧪 CRUD Validation via Braid for tenant: ${tenantSlug}\n`);
  let createdId = null;

  // 1) Create activity via schedule_meeting (ensures post-create type update)
  {
    const args = {
      tenant: tenantSlug,
      subject: `Braid CRUD Test ${Date.now()}`,
      attendees: [],
      date_time: new Date().toISOString(),
      duration_minutes: 30,
      assigned_to: ''
    };
    const res = await executeBraidTool('schedule_meeting', args, tenantRecord, null);
    if (res?.tag === 'Ok' && res.value?.id) {
      createdId = res.value.id;
      logStep('create_activity', 'PASS', `id=${createdId}`);
    } else {
      logStep('create_activity', 'FAIL', JSON.stringify(res?.error || res));
      process.exit(1);
    }
  }

  // 2) Update activity (subject and body)
  {
    const args = {
      tenant: tenantSlug,
      activity_id: createdId,
      updates: { subject: 'Updated subject', body: 'Updated body', status: 'planned' }
    };
    const res = await executeBraidTool('update_activity', args, tenantRecord, null);
    if (res?.tag === 'Ok' && res.value?.subject === 'Updated subject') {
      logStep('update_activity', 'PASS');
    } else {
      logStep('update_activity', 'FAIL', JSON.stringify(res?.error || res));
      process.exit(1);
    }
  }

  // 3) Mark complete
  {
    const args = {
      tenant: tenantSlug,
      activity_id: createdId
    };
    const res = await executeBraidTool('mark_activity_complete', args, tenantRecord, null);
    if (res?.tag === 'Ok' && res.value?.status === 'completed') {
      logStep('mark_activity_complete', 'PASS');
    } else {
      logStep('mark_activity_complete', 'FAIL', JSON.stringify(res?.error || res));
      process.exit(1);
    }
  }

  // 4) Delete activity
  {
    const args = {
      tenant: tenantSlug,
      activity_id: createdId
    };
    const res = await executeBraidTool('delete_activity', args, tenantRecord, null);
    if (res?.tag === 'Ok' && res.value === true) {
      logStep('delete_activity', 'PASS');
    } else {
      logStep('delete_activity', 'FAIL', JSON.stringify(res?.error || res));
      process.exit(1);
    }
  }

  console.log('\n✨ CRUD validation completed successfully');
}

run().catch((e) => {
  console.error('Unexpected error during CRUD validation:', e);
  process.exit(1);
});
