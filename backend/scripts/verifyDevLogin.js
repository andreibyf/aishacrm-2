// Verify dev superadmin login with updated password
// Usage: node backend/scripts/verifyDevLogin.js [email] [password]
// Falls back to SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD from .env
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const email = process.argv[2] || process.env.SUPERADMIN_EMAIL;
  const password = process.argv[3] || process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Usage: node backend/scripts/verifyDevLogin.js <email> <password>');
    process.exit(1);
  }
  const supabaseUrl = getEnv('SUPABASE_URL');
  const anonKey = getEnv('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl.includes('efzqxjpfewkrgpdootte')) {
    console.error('Refusing: Not dev project URL.');
    process.exit(1);
  }
  const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log('🔐 Attempting signInWithPassword for', email);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
  }
  console.log('✅ Login success. User id:', data.user.id);
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
