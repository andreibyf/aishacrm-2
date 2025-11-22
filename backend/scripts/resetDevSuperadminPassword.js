// Dev password reset script for Supabase auth user (superadmin)
// Usage (PowerShell): node backend/scripts/resetDevSuperadminPassword.js abyfield@4vdataconsulting.com NewPassword123!
// Safeguards: Will refuse to run against production Supabase project.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DEV_PROJECT_ID = 'efzqxjpfewkrgpdootte';
const PROD_PROJECT_ID = 'ehjlenywplgyiahgxkfj';

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error('Usage: node backend/scripts/resetDevSuperadminPassword.js <email> <newPassword>');
    process.exit(1);
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKeyRaw = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const serviceKey = serviceKeyRaw.startsWith('-') ? serviceKeyRaw.slice(1) : serviceKeyRaw; // strip accidental leading dash

  if (supabaseUrl.includes(PROD_PROJECT_ID)) {
    console.error('🚫 Refusing to run: target is PRODUCTION project. Aborting.');
    process.exit(1);
  }
  if (!supabaseUrl.includes(DEV_PROJECT_ID)) {
    console.error('⚠️ Unknown project id in SUPABASE_URL. Expected development project. Aborting for safety.');
    process.exit(1);
  }

  console.log(`🔐 Resolving user id for email: ${email}`);
  // Use REST endpoint to list users with pagination; dev environment small so single page is fine.
  const listUrl = `${supabaseUrl}/auth/v1/admin/users?per_page=200`;
  const listResp = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }
  });
  if (!listResp.ok) {
    console.error('Failed to list users via REST:', listResp.status, await listResp.text());
    process.exit(1);
  }
  const listJson = await listResp.json();
  const user = (listJson.users || []).find(u => u.email === email);
  if (!user) {
    console.error('User not found for email:', email);
    process.exit(1);
  }
  console.log(`✅ Found user id ${user.id}. Updating password via REST PUT...`);
  const putUrl = `${supabaseUrl}/auth/v1/admin/users/${user.id}`;
  const putResp = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: newPassword })
  });
  if (!putResp.ok) {
    console.error('Password update failed:', putResp.status, await putResp.text());
    process.exit(1);
  }
  console.log('🎉 Password updated successfully for', email);
  console.log('Next: run verify script to test login.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
