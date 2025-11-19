/**
 * Create Admin User Script
 * 
 * Creates an initial superadmin user via Supabase Admin API.
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from environment variables.
 * 
 * Usage (Docker):
 *   docker exec -it aishacrm-backend node /app/scripts/create-admin.js
 * 
 * Usage (Local):
 *   cd backend && node scripts/create-admin.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Simple CLI arg parser to allow overriding env vars and adding flags
const argv = process.argv.slice(2);
function getArg(flag) {
  const eq = argv.find(a => a === `--${flag}` || a.startsWith(`--${flag}=`));
  if (!eq) return undefined;
  if (eq.includes('=')) return eq.split('=')[1];
  const idx = argv.indexOf(eq);
  const next = argv[idx + 1];
  if (next && !next.startsWith('--')) return next;
  return undefined;
}

const SUPABASE_URL = getArg('supabase-url') || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = getArg('service-key') || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = getArg('email') || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = getArg('password') || process.env.ADMIN_PASSWORD;
const dryRun = argv.includes('--dry-run') || argv.includes('--dryrun');
const forceYes = argv.includes('--yes') || argv.includes('-y');

// Default superadmin tenant ID (UUID format)
const SUPERADMIN_TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function createAdmin() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   AI-SHA CRM - Admin User Creation Script   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Validate environment variables
  if (!SUPABASE_URL) {
    console.error('❌ Error: SUPABASE_URL not found in environment variables');
    console.error('   Set SUPABASE_URL or VITE_SUPABASE_URL in backend/.env');
    process.exit(1);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
    console.error('   This is the service_role key from Supabase project settings');
    console.error('   DO NOT use the anon key - admin creation requires service_role');
    process.exit(1);
  }

  if (!ADMIN_EMAIL) {
    console.error('❌ Error: ADMIN_EMAIL not found in environment variables');
    console.error('   Set ADMIN_EMAIL=admin@yourcompany.com in backend/.env or docker .env');
    process.exit(1);
  }

  if (!ADMIN_PASSWORD) {
    console.error('❌ Error: ADMIN_PASSWORD not found in environment variables');
    console.error('   Set ADMIN_PASSWORD=YourSecurePassword123! in backend/.env or docker .env');
    process.exit(1);
  }

  // Validate password strength
  if (ADMIN_PASSWORD.length < 8) {
    console.error('❌ Error: ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Admin Email:  ${ADMIN_EMAIL}`);
  console.log(`  Password:     ${ADMIN_PASSWORD ? '*'.repeat(ADMIN_PASSWORD.length) : '(none)'}${ADMIN_PASSWORD ? ` (${ADMIN_PASSWORD.length} characters)` : ''}\n`);

  if (dryRun) {
    console.log('⚠️  Dry-run mode enabled (`--dry-run`). No changes will be made.');
    console.log('\nPlan:');
    console.log(`  - Ensure Supabase project at: ${SUPABASE_URL}`);
    console.log(`  - Would create or update auth user: ${ADMIN_EMAIL}`);
    console.log(`  - Would set role: superadmin and tenant: ${SUPERADMIN_TENANT_ID}`);
    console.log('\nTo perform the actual changes, re-run without `--dry-run` and add `--yes` to skip confirmation.');
    process.exit(0);
  }

  // Confirmation prompt for safety when not running in unattended mode
  async function confirmProceed() {
    if (forceYes) return true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question('Type YES to proceed with creating/updating the admin user: ', ans => {
        rl.close();
        resolve(ans);
      });
    });
    return answer === 'YES';
  }

  const confirmed = await confirmProceed();
  if (!confirmed) {
    console.log('Aborted by user. No changes were made.');
    process.exit(0);
  }

  // Create Supabase admin client with service role key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('🔍 Checking if user already exists...');

  try {
    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error checking existing users:', listError.message);
      process.exit(1);
    }

    const existingUser = existingUsers?.users?.find(u => u.email === ADMIN_EMAIL);

    if (existingUser) {
      console.log(`⚠️  User ${ADMIN_EMAIL} already exists!`);
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Created: ${existingUser.created_at}`);
      
      // Ask if they want to update the password
      console.log('\n🔄 Updating password for existing user...');
      
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { password: ADMIN_PASSWORD }
      );

      if (updateError) {
        console.error('❌ Error updating password:', updateError.message);
        process.exit(1);
      }

      console.log('✅ Password updated successfully!');
      console.log('\n═══════════════════════════════════════════════');
      console.log('You can now sign in with:');
      console.log(`  Email:    ${ADMIN_EMAIL}`);
      console.log(`  Password: ${ADMIN_PASSWORD}`);
      console.log('═══════════════════════════════════════════════\n');
      process.exit(0);
    }

    console.log('✓ No existing user found, creating new admin user...\n');

    // Create the admin user
    console.log('📝 Creating admin user in Supabase Auth...');
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true, // Skip email verification
      user_metadata: {
        tenant_id: SUPERADMIN_TENANT_ID,
        role: 'superadmin',
        full_name: 'Super Admin',
        created_by: 'create-admin-script'
      }
    });

    if (authError) {
      console.error('❌ Error creating user in Supabase Auth:', authError.message);
      process.exit(1);
    }

    console.log('✅ Auth user created successfully!');
    console.log(`   User ID: ${authData.user.id}`);

    // Create user record in users table
    console.log('\n📝 Creating user record in users table...');
    
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: ADMIN_EMAIL,
        tenant_id: SUPERADMIN_TENANT_ID,
        role: 'superadmin',
        full_name: 'Super Admin',
        is_active: true
      });

    if (userError) {
      console.error('⚠️  Warning: Could not create user record in users table');
      console.error('   Error:', userError.message);
      console.error('   The auth user was created successfully, but the users table entry failed.');
      console.error('   You may need to create this manually or check RLS policies.');
    } else {
      console.log('✅ User record created successfully!');
    }

    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║          Admin User Created Successfully!     ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('\nYou can now sign in at:');
    console.log(`  URL:      ${SUPABASE_URL.replace('supabase.co', 'supabase.co').replace(/https:\/\/(.+)\.supabase\.co/, 'https://app.aishacrm.com')}`);
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  Role:     superadmin`);
    console.log(`  Tenant:   ${SUPERADMIN_TENANT_ID} (superadmin global access)`);
    console.log('\n✨ Next steps:');
    console.log('   1. Sign in with the credentials above');
    console.log('   2. Create tenant organizations for your customers');
    console.log('   3. Create regular users and assign them to tenants');
    console.log('   4. Update Supabase Site URL to https://app.aishacrm.com');
    console.log('   5. Configure email templates in Supabase dashboard\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the script
createAdmin();
