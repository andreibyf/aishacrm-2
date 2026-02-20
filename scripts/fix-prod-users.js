#!/usr/bin/env node
// Fix production user/auth sync issues
// Run: doppler run --project aishacrm --config prd_prd -- node scripts/fix-prod-users.js
// DRY_RUN=1 doppler run ... to preview changes without writing
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.env.DRY_RUN === '1';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  if (DRY_RUN) console.log('🔍 DRY RUN — no changes will be written\n');

  // ── Gather current state ──
  const { data: users } = await sb.from('users').select('*');
  const { data: emps } = await sb.from('employees').select('*');
  const { data: tenants } = await sb.from('tenant').select('id, tenant_id');
  const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
  const authUsers = authData.users || [];

  const pubByEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const authByEmail = Object.fromEntries(authUsers.map((a) => [a.email, a]));
  // In this schema tenant_id == id (both UUIDs), build a lookup set
  const tenantUuidSet = new Set((tenants || []).map((t) => t.id));
  const tenantMap = Object.fromEntries((tenants || []).map((t) => [t.tenant_id, t.id]));

  const nowIso = new Date().toISOString();
  let changes = 0;

  // ── 1. Create public.users for CRM employees that are missing ──
  console.log('═══ 1. Create missing public.users for CRM employees ═══');
  const crmEmps = emps.filter((e) => e.metadata?.has_crm_access === true);
  for (const emp of crmEmps) {
    if (pubByEmail[emp.email]) continue; // already has record

    const authUser = authByEmail[emp.email?.toLowerCase()] || authByEmail[emp.email];
    // tenant_id on employees is already the UUID in prod
    const tenantUuid = tenantUuidSet.has(emp.tenant_id)
      ? emp.tenant_id
      : tenantMap[emp.tenant_id] || null;
    const record = {
      email: emp.email,
      first_name: emp.first_name || emp.email.split('@')[0],
      last_name: emp.last_name || '',
      role: emp.metadata?.crm_user_employee_role || 'employee',
      status: authUser?.email_confirmed_at ? 'active' : 'invited',
      tenant_id: emp.tenant_id,
      tenant_uuid: tenantUuid,
      metadata: {
        display_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
        source: 'employee_crm_access',
        employee_id: emp.id,
        has_crm_access: true,
        password_change_required: authUser?.user_metadata?.password_change_required ?? true,
      },
      created_at: nowIso,
      updated_at: nowIso,
    };

    console.log(
      `  + ${emp.email} → role=${record.role}, status=${record.status}, tenant_uuid=${tenantUuid ? '✓' : '✗'}`,
    );
    if (!DRY_RUN) {
      const { error } = await sb.from('users').insert([record]);
      if (error) console.error(`    ✗ INSERT failed:`, error.message);
      else console.log(`    ✓ Created`);
    }
    changes++;
  }

  // ── 2. Backfill tenant_uuid for admins missing it ──
  console.log('\n═══ 2. Backfill missing tenant_uuid ═══');
  for (const u of users) {
    if (u.tenant_uuid || !u.tenant_id || u.role === 'superadmin') continue;
    const uuid = tenantUuidSet.has(u.tenant_id) ? u.tenant_id : tenantMap[u.tenant_id];
    if (!uuid) {
      console.log(`  ? ${u.email} — cannot resolve tenant_id="${u.tenant_id}"`);
      continue;
    }

    console.log(`  ~ ${u.email} → tenant_uuid=${uuid}`);
    if (!DRY_RUN) {
      const { error } = await sb
        .from('users')
        .update({ tenant_uuid: uuid, updated_at: nowIso })
        .eq('id', u.id);
      if (error) console.error(`    ✗ UPDATE failed:`, error.message);
      else console.log(`    ✓ Updated`);
    }
    changes++;
  }

  // ── 3. Clear stale password_change_required for users who have logged in ──
  console.log('\n═══ 3. Clear stale password_change_required in auth.users ═══');
  for (const au of authUsers) {
    const meta = au.user_metadata || {};
    if (!meta.password_change_required) continue;
    if (!au.last_sign_in_at) continue; // hasn't logged in yet — leave it

    console.log(
      `  ~ ${au.email} → clear password_change_required (last login: ${au.last_sign_in_at})`,
    );
    if (!DRY_RUN) {
      const updatedMeta = { ...meta, password_change_required: false };
      delete updatedMeta.password_expires_at;
      const { error } = await sb.auth.admin.updateUserById(au.id, { user_metadata: updatedMeta });
      if (error) console.error(`    ✗ UPDATE failed:`, error.message);
      else console.log(`    ✓ Updated`);
    }
    changes++;
  }

  // ── 4. Update employee crm_invite_status for confirmed users ──
  console.log('\n═══ 4. Update employee crm_invite_status ═══');
  for (const emp of crmEmps) {
    if (emp.metadata?.crm_invite_status === 'accepted') continue;
    const authUser = authByEmail[emp.email?.toLowerCase()] || authByEmail[emp.email];
    if (!authUser?.email_confirmed_at) continue;

    const newMeta = { ...emp.metadata, crm_invite_status: 'accepted' };
    console.log(`  ~ ${emp.email} → crm_invite_status=accepted`);
    if (!DRY_RUN) {
      const { error } = await sb
        .from('employees')
        .update({ metadata: newMeta, updated_at: nowIso })
        .eq('id', emp.id);
      if (error) console.error(`    ✗ UPDATE failed:`, error.message);
      else console.log(`    ✓ Updated`);
    }
    changes++;
  }

  console.log(`\n${DRY_RUN ? '🔍 Would make' : '✅ Made'} ${changes} change(s)`);
  if (DRY_RUN) console.log('Re-run without DRY_RUN=1 to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
