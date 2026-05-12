// resign-test.mjs (4VD-43 day 5 PR 2 testing helper)
//
// Quick re-testing helper for the eSign flow. Clones the most recent
// signing_session in a tenant, mints a fresh signing_token, inserts a
// new row, and prints the /sign/<slug>/<token> URL ready for paste.
//
// Why: after a recipient submits, the token's signing_session moves to
// status='signed'/'completed' and the public sign page goes read-only.
// That's correct legal/audit behavior — tokens are single-use. To
// exercise the signing pipeline again (e.g., to verify a stamp-side
// fix), you need a fresh session. The CRM "Send Document" button is
// the production path; this script skips the dialog + email + recipient
// inbox check when you're iterating on the engine itself.
//
// IMPORTANT: this writes directly to signing_sessions, bypassing the
// /api/submissions route. It deliberately does NOT trigger an email
// send — the URL is printed to stdout for direct paste. Use the CRM
// Send Document flow when you want to test the email path itself.
//
// Usage (from a backend container with SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY in env):
//
//   docker exec aishacrm-backend node scripts/resign-test.mjs
//   docker exec aishacrm-backend node scripts/resign-test.mjs <tenant_id>
//
// Defaults to tenant 759a83e8-7340-4482-a586-cd2d049fb0b5 (Dev Local
// Tenant) when no arg is given. Pass a different tenant UUID to clone
// the most recent session in that tenant instead.

import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../lib/supabaseFactory.js';

const DEFAULT_TENANT_ID = '759a83e8-7340-4482-a586-cd2d049fb0b5';
const tenantId = process.argv[2] || DEFAULT_TENANT_ID;

const frontendUrl =
  process.env.FRONTEND_URL ||
  process.env.PUBLIC_FRONTEND_URL ||
  'http://localhost:4000';

const supabase = getSupabaseAdmin();
if (!supabase) {
  console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from env');
  process.exit(1);
}

// 1. Find the most recent signing_session in this tenant. Skip archived
//    rows so we don't clone something the operator already deleted.
const { data: prev, error: prevErr } = await supabase
  .from('signing_sessions')
  .select('id, template_id, related_to, related_id, recipient_email, recipient_name, message')
  .eq('tenant_id', tenantId)
  .is('archived_at', null)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (prevErr) {
  console.error('Lookup failed:', prevErr.message);
  process.exit(1);
}
if (!prev) {
  console.error(
    `No signing_session found for tenant ${tenantId}. Send one through the CRM first.`,
  );
  process.exit(1);
}

// 2. Mint a 32-byte hex token. Matches generateSigningToken() in
//    routes/submissions.js so the public sign route accepts it.
const token = crypto.randomBytes(32).toString('hex');

// 3. Insert a fresh row cloning the previous session's metadata. The
//    expires_at default (now() + 14 days) and status default ('pending')
//    come from the table's column defaults.
const { data: inserted, error: insErr } = await supabase
  .from('signing_sessions')
  .insert({
    tenant_id: tenantId,
    template_id: prev.template_id,
    related_to: prev.related_to,
    related_id: prev.related_id,
    recipient_email: prev.recipient_email,
    recipient_name: prev.recipient_name,
    message: prev.message,
    signing_token: token,
  })
  .select('id, expires_at')
  .single();

if (insErr || !inserted) {
  console.error('Insert failed:', insErr?.message);
  process.exit(1);
}

// 4. Look up the tenant slug for the URL path. Cosmetic — the token is
//    the only authoritative gate — but matches the format the email
//    builder produces so the URL "looks right."
const { data: tenant } = await supabase
  .from('tenant')
  .select('tenant_id, name')
  .eq('id', tenantId)
  .maybeSingle();

const slug = tenant?.tenant_id || 'sign';

console.log('');
console.log('✓ New signing session created');
console.log('');
console.log(`  Session ID:    ${inserted.id}`);
console.log(`  Tenant:        ${tenant?.name || tenantId}`);
console.log(`  Template ID:   ${prev.template_id}`);
console.log(`  Recipient:     ${prev.recipient_email}${prev.recipient_name ? ` (${prev.recipient_name})` : ''}`);
console.log(`  Related to:    ${prev.related_to}/${prev.related_id}`);
console.log(`  Expires at:    ${inserted.expires_at}`);
console.log(`  Cloned from:   ${prev.id}`);
console.log('');
console.log('  Sign URL (paste into browser):');
console.log(`    ${frontendUrl}/sign/${slug}/${token}`);
console.log('');
