#!/usr/bin/env node
/**
 * Audit script: Cross-reference public.users, employees, and auth.users
 * Run inside backend container: node /app/scripts/audit-users.js
 */
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // 1. All public.users
  const { data: users } = await supabase
    .from('users')
    .select('id,email,first_name,last_name,role,status,tenant_id,tenant_uuid,metadata');
  console.log('=== public.users (' + (users || []).length + ' rows) ===');
  (users || []).forEach((u) => {
    const m = u.metadata || {};
    console.log(
      JSON.stringify({
        email: u.email,
        role: u.role,
        status: u.status,
        tid: u.tenant_id,
        tuuid: u.tenant_uuid,
        crm: m.crm_access,
        eid: m.employee_id,
        via: m.created_via,
      }),
    );
  });

  // 2. All employees (with CRM access flag)
  const { data: emps } = await supabase
    .from('employees')
    .select('id,email,first_name,last_name,role,status,tenant_id,metadata');
  const crmEmps = (emps || []).filter((e) => (e.metadata || {}).has_crm_access === true);
  console.log(
    '\n=== employees with CRM access (' + crmEmps.length + ' of ' + (emps || []).length + ') ===',
  );
  crmEmps.forEach((e) =>
    console.log(
      JSON.stringify({
        id: e.id,
        email: e.email,
        name: e.first_name + ' ' + e.last_name,
        role: e.role,
        status: e.status,
        tid: e.tenant_id,
      }),
    ),
  );

  // 3. CRM employees missing public.users record
  const userEmails = new Set((users || []).map((u) => (u.email || '').toLowerCase()));
  const orphans = crmEmps.filter((e) => !userEmails.has((e.email || '').toLowerCase()));
  console.log('\n=== CRM employees missing public.users (' + orphans.length + ') ===');
  orphans.forEach((e) =>
    console.log('  ' + e.email + ' (' + e.first_name + ' ' + e.last_name + ')'),
  );

  // 4. Users with broken employee_id references
  const empIds = new Set((emps || []).map((e) => e.id));
  const broken = (users || []).filter(
    (u) => (u.metadata || {}).employee_id && !empIds.has((u.metadata || {}).employee_id),
  );
  console.log('\n=== Users with broken employee_id refs (' + broken.length + ') ===');
  broken.forEach((u) => console.log('  ' + u.email + ' -> eid=' + (u.metadata || {}).employee_id));

  // 5. Users missing tenant_uuid (have tenant_id but no tenant_uuid)
  const noUuid = (users || []).filter((u) => u.tenant_id && !u.tenant_uuid);
  console.log('\n=== Users with tenant_id but NO tenant_uuid (' + noUuid.length + ') ===');
  noUuid.forEach((u) => console.log('  ' + u.email + ' tid=' + u.tenant_id));

  // 6. Duplicate emails across users+employees
  const allEmails = [
    ...(users || []).map((u) => ({
      email: (u.email || '').toLowerCase(),
      table: 'users',
      role: u.role,
    })),
    ...(emps || []).map((e) => ({
      email: (e.email || '').toLowerCase(),
      table: 'employees',
      role: e.role,
    })),
  ];
  const emailCounts = {};
  allEmails.forEach((r) => {
    if (!r.email) return;
    if (!emailCounts[r.email]) emailCounts[r.email] = [];
    emailCounts[r.email].push(r.table + '(' + r.role + ')');
  });
  const dupes = Object.entries(emailCounts).filter(([, v]) => v.length > 1);
  console.log('\n=== Emails appearing in BOTH users+employees (' + dupes.length + ') ===');
  dupes.forEach(([email, tables]) => console.log('  ' + email + ' -> ' + tables.join(', ')));

  // 7. Check auth.users via Supabase Admin API
  console.log('\n=== auth.users audit ===');
  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.log('ERROR listing auth users: ' + authErr.message);
    return;
  }
  const authUsers = authData.users || [];
  console.log('Total auth.users: ' + authUsers.length);

  // Auth users without public.users or employees record
  const crmEmails = new Set([
    ...(users || []).map((u) => (u.email || '').toLowerCase()),
    ...(emps || []).map((e) => (e.email || '').toLowerCase()),
  ]);
  const authOrphans = authUsers.filter((a) => !crmEmails.has((a.email || '').toLowerCase()));
  console.log('Auth users with NO CRM record: ' + authOrphans.length);
  authOrphans.forEach((a) => {
    const m = a.user_metadata || {};
    console.log(
      '  ' +
        a.email +
        ' | confirmed=' +
        !!a.email_confirmed_at +
        ' | role=' +
        m.role +
        ' | tid=' +
        m.tenant_id,
    );
  });

  // CRM users with auth but password never set (invited but not accepted)
  const pendingInvites = authUsers.filter((a) => {
    const m = a.user_metadata || {};
    return m.password_change_required === true && !a.last_sign_in_at;
  });
  console.log(
    '\nPending invites (never signed in, password_change_required): ' + pendingInvites.length,
  );
  pendingInvites.forEach((a) =>
    console.log(
      '  ' + a.email + ' | created=' + a.created_at + ' | confirmed=' + !!a.email_confirmed_at,
    ),
  );

  // Auth users where email_confirmed_at is null (invite not clicked)
  const unconfirmed = authUsers.filter((a) => !a.email_confirmed_at);
  console.log('\nUnconfirmed auth users (invite link not clicked): ' + unconfirmed.length);
  unconfirmed.forEach((a) => console.log('  ' + a.email + ' | created=' + a.created_at));
}

run().catch(console.error);
