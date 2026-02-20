#!/usr/bin/env node
// Production user/auth audit script - run with: doppler run --project aishacrm --config prd_prd -- node scripts/audit-prod-users.js
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: users } = await sb.from('users').select('email, role, status, tenant_uuid');
  const { data: emps } = await sb.from('employees').select('email, metadata');
  const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 });
  const authUsers = authData.users || [];

  const pubEmails = new Set(users.map((u) => u.email));
  const empEmails = new Set(emps.map((e) => (e.email || '').toLowerCase()));
  const authEmails = new Set(authUsers.map((a) => a.email));

  // CRM employees without public.users record
  const crmEmps = emps.filter((e) => e.metadata && e.metadata.has_crm_access === true);
  const crmNoPub = crmEmps.filter((e) => !pubEmails.has(e.email));
  console.log('CRM employees WITHOUT public.users record (' + crmNoPub.length + '):');
  for (const e of crmNoPub) console.log('  ' + e.email);

  // CRM employees without auth.users
  const crmNoAuth = crmEmps.filter((e) => !authEmails.has((e.email || '').toLowerCase()));
  console.log('\nCRM employees WITHOUT auth.users (' + crmNoAuth.length + '):');
  for (const e of crmNoAuth) console.log('  ' + e.email);

  // public.users without auth.users
  const pubNoAuth = users.filter((u) => !authEmails.has(u.email));
  console.log('\npublic.users WITHOUT auth.users (' + pubNoAuth.length + '):');
  for (const u of pubNoAuth) console.log('  ' + u.email + ' role=' + u.role);

  // auth.users without public.users or employees
  const orphanAuth = authUsers.filter((a) => !pubEmails.has(a.email) && !empEmails.has(a.email));
  console.log('\nOrphan auth.users (' + orphanAuth.length + '):');
  for (const o of orphanAuth) console.log('  ' + o.email);

  // public.users missing tenant_uuid
  const noUuid = users.filter((u) => !u.tenant_uuid && u.role !== 'superadmin');
  console.log('\npublic.users missing tenant_uuid (non-superadmin) (' + noUuid.length + '):');
  for (const u of noUuid) console.log('  ' + u.email + ' role=' + u.role);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
