// Generate a one-time password recovery link for a dev user.
// Usage: node backend/scripts/generateDevRecoveryLink.js <email>
import 'dotenv/config';

const DEV_PROJECT_ID = 'efzqxjpfewkrgpdootte';
const PROD_PROJECT_ID = 'ehjlenywplgyiahgxkfj';

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const email = process.argv[2] || process.env.SUPERADMIN_EMAIL;
  if (!email) {
    console.error('Usage: node backend/scripts/generateDevRecoveryLink.js <email>');
    process.exit(1);
  }
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKeyRaw = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const serviceKey = serviceKeyRaw.startsWith('-') ? serviceKeyRaw.slice(1) : serviceKeyRaw;

  if (supabaseUrl.includes(PROD_PROJECT_ID)) {
    console.error('🚫 Refusing: production project.');
    process.exit(1);
  }
  if (!supabaseUrl.includes(DEV_PROJECT_ID)) {
    console.error('⚠️ Unknown project id; aborting for safety.');
    process.exit(1);
  }

  const url = `${supabaseUrl}/auth/v1/admin/generate_link`;
  // Attempt 1: standard recovery payload
  let payloads = [
    { type: 'recovery', email, redirect_to: 'http://localhost:4000' },
    // Fallback: some Supabase versions expect email_otp_type for recovery verification
    { type: 'recovery', email, email_otp_type: 'recovery', redirect_to: 'http://localhost:4000' }
  ];
  let lastError = null;
  for (const body of payloads) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (resp.ok) {
      const json = await resp.json();
      console.log('🔗 Recovery link generated. Open in browser to set new password:');
      console.log(json.action_link);
      console.log('Expires at:', json.email_otp?.expires_at || 'N/A');
      process.exit(0);
    } else {
      lastError = await resp.text();
      console.warn('Recovery attempt failed with status', resp.status, 'Body:', lastError);
    }
  }
  console.error('Failed to generate recovery link after all attempts. Last error:', lastError);
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
