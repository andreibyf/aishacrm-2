#!/usr/bin/env node
/**
 * Bulk Delete Users Script
 * 
 * Safely deletes multiple users from both Supabase Auth and the application database.
 * 
 * Usage:
 *   node backend/bulk-delete-users.js --dry-run                    # Preview deletions
 *   node backend/bulk-delete-users.js --email=pattern              # Delete by email pattern
 *   node backend/bulk-delete-users.js --file=users.txt             # Delete from file (one email per line)
 *   node backend/bulk-delete-users.js --created-after=2025-11-01   # Delete by creation date
 * 
 * Safety features:
 *   - Dry-run mode by default
 *   - Protects immutable superadmin accounts
 *   - Requires explicit confirmation before deletion
 *   - Creates backup CSV before deletion
 *   - Detailed logging
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from backend/.env
config({ path: resolve(__dirname, '.env') });

// Dynamically import Supabase functions
const { initSupabaseDB, getSupabaseClient } = await import('./lib/supabase-db.js');
const { 
  listAuthUsers, 
  deleteAuthUser
} = await import('./lib/supabaseAuth.js');

// Initialize database connection
await initSupabaseDB();
const supabase = getSupabaseClient();

// Protected superadmin accounts that cannot be deleted
const IMMUTABLE_SUPERADMINS = [
  'abyfield@4vdataconsulting.com', // Primary system owner
];

// Parse command-line arguments
function parseArgs() {
  const args = {
    dryRun: true, // Default to dry-run for safety
    emailPattern: null,
    file: null,
    createdAfter: null,
    confirm: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--execute') args.dryRun = false;
    else if (arg.startsWith('--email=')) args.emailPattern = arg.split('=')[1];
    else if (arg.startsWith('--file=')) args.file = arg.split('=')[1];
    else if (arg.startsWith('--created-after=')) args.createdAfter = arg.split('=')[1];
    else if (arg === '--confirm') args.confirm = true;
  }

  return args;
}

// Read emails from file (one per line)
function readEmailsFromFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('@'));
}

// Fetch users matching criteria
async function fetchMatchingUsers(args) {
  const matchingUsers = [];

  // Get all users from Supabase Auth
  const { users: authUsers, error } = await listAuthUsers();
  if (error) {
    console.error('❌ Failed to fetch auth users:', error);
    return [];
  }

  console.log(`📊 Total auth users: ${authUsers.length}`);

  // Fetch application users from database
  const { data: dbUsers, error: dbError } = await supabase
    .from('users')
    .select('id, email, role, created_at, tenant_id');

  if (dbError) {
    console.warn('⚠️  Could not fetch database users:', dbError.message);
  }

  const { data: employeeUsers, error: empError } = await supabase
    .from('employees')
    .select('id, email, role, created_at, tenant_id');

  if (empError) {
    console.warn('⚠️  Could not fetch employee users:', empError.message);
  }

  // Build combined user list
  const allUsers = [];
  
  // Add auth users
  for (const authUser of authUsers) {
    const dbUser = dbUsers?.find(u => u.email.toLowerCase() === authUser.email?.toLowerCase());
    const empUser = employeeUsers?.find(u => u.email.toLowerCase() === authUser.email?.toLowerCase());
    
    allUsers.push({
      auth_id: authUser.id,
      email: authUser.email,
      created_at: authUser.created_at,
      auth_role: authUser.user_metadata?.role,
      db_user: dbUser,
      emp_user: empUser,
      table: dbUser ? 'users' : (empUser ? 'employees' : 'auth_only'),
    });
  }

  // Filter by criteria
  for (const user of allUsers) {
    // Skip protected superadmins
    if (IMMUTABLE_SUPERADMINS.some(email => email.toLowerCase() === user.email?.toLowerCase())) {
      console.log(`🔒 Skipping protected superadmin: ${user.email}`);
      continue;
    }

    let matches = true;

    // Email pattern filter
    if (args.emailPattern) {
      const pattern = new RegExp(args.emailPattern, 'i');
      if (!pattern.test(user.email)) {
        matches = false;
      }
    }

    // Created after date filter
    if (args.createdAfter && user.created_at) {
      const userDate = new Date(user.created_at);
      const cutoffDate = new Date(args.createdAfter);
      if (userDate < cutoffDate) {
        matches = false;
      }
    }

    // File filter
    if (args.file) {
      const emailsFromFile = readEmailsFromFile(args.file);
      if (!emailsFromFile.some(e => e.toLowerCase() === user.email?.toLowerCase())) {
        matches = false;
      }
    }

    if (matches) {
      matchingUsers.push(user);
    }
  }

  return matchingUsers;
}

// Create backup CSV
function createBackup(users) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = resolve(__dirname, `user-backup-${timestamp}.csv`);
  
  const header = 'auth_id,email,created_at,auth_role,table,db_id,tenant_id\n';
  const rows = users.map(u => 
    `${u.auth_id},"${u.email}",${u.created_at},${u.auth_role || ''},${u.table},${u.db_user?.id || u.emp_user?.id || ''},${u.db_user?.tenant_id || u.emp_user?.tenant_id || ''}`
  ).join('\n');
  
  writeFileSync(backupFile, header + rows);
  console.log(`💾 Backup created: ${backupFile}`);
  
  return backupFile;
}

// Delete a single user
async function deleteUser(user) {
  const results = {
    email: user.email,
    auth_deleted: false,
    db_deleted: false,
    errors: [],
  };

  try {
    // Delete from Supabase Auth
    if (user.auth_id) {
      const { error: authError } = await deleteAuthUser(user.auth_id);
      if (authError) {
        results.errors.push(`Auth: ${authError.message}`);
      } else {
        results.auth_deleted = true;
      }
    }

    // Delete from database
    if (user.db_user) {
      const { error: dbError } = await supabase
        .from('users')
        .delete()
        .eq('id', user.db_user.id);
      
      if (dbError) {
        results.errors.push(`DB users: ${dbError.message}`);
      } else {
        results.db_deleted = true;
      }
    }

    if (user.emp_user) {
      const { error: empError } = await supabase
        .from('employees')
        .delete()
        .eq('id', user.emp_user.id);
      
      if (empError) {
        results.errors.push(`DB employees: ${empError.message}`);
      } else {
        results.db_deleted = true;
      }
    }

  } catch (error) {
    results.errors.push(`Exception: ${error.message}`);
  }

  return results;
}

// Prompt for confirmation
function promptConfirmation(count) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`\n⚠️  Are you sure you want to delete ${count} users? (type 'yes' to confirm): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

// Main execution
async function main() {
  console.log('🗑️  Bulk User Deletion Tool\n');

  const args = parseArgs();

  // Validation
  if (!args.emailPattern && !args.file && !args.createdAfter) {
    console.error('❌ Error: You must specify at least one filter:');
    console.error('   --email=pattern');
    console.error('   --file=users.txt');
    console.error('   --created-after=YYYY-MM-DD');
    console.error('\nUse --dry-run to preview deletions (default)');
    console.error('Use --execute to actually delete users');
    process.exit(1);
  }

  console.log('🔍 Searching for users matching criteria...\n');

  const users = await fetchMatchingUsers(args);

  if (users.length === 0) {
    console.log('✅ No users match the specified criteria.');
    process.exit(0);
  }

  console.log(`\n📋 Found ${users.length} users to delete:\n`);

  // Display users
  users.forEach((user, idx) => {
    console.log(`${idx + 1}. ${user.email}`);
    console.log(`   Table: ${user.table}, Created: ${user.created_at}`);
    console.log(`   Auth ID: ${user.auth_id}`);
    if (user.db_user) console.log(`   DB ID (users): ${user.db_user.id}`);
    if (user.emp_user) console.log(`   DB ID (employees): ${user.emp_user.id}`);
    console.log('');
  });

  if (args.dryRun) {
    console.log('🔒 DRY RUN MODE - No users will be deleted');
    console.log('   Use --execute to actually delete these users');
    process.exit(0);
  }

  // Create backup before deletion
  createBackup(users);

  // Confirmation prompt
  if (!args.confirm) {
    const confirmed = await promptConfirmation(users.length);
    if (!confirmed) {
      console.log('\n❌ Deletion cancelled.');
      process.exit(0);
    }
  }

  console.log('\n🗑️  Starting deletion...\n');

  // Delete users
  const results = [];
  for (const [idx, user] of users.entries()) {
    process.stdout.write(`Deleting ${idx + 1}/${users.length}: ${user.email}... `);
    
    const result = await deleteUser(user);
    results.push(result);

    if (result.errors.length === 0) {
      console.log('✅');
    } else {
      console.log(`⚠️  ${result.errors.join(', ')}`);
    }
  }

  // Summary
  console.log('\n📊 Deletion Summary:');
  console.log(`   Total: ${results.length}`);
  console.log(`   Auth deleted: ${results.filter(r => r.auth_deleted).length}`);
  console.log(`   DB deleted: ${results.filter(r => r.db_deleted).length}`);
  console.log(`   Errors: ${results.filter(r => r.errors.length > 0).length}`);

  if (results.some(r => r.errors.length > 0)) {
    console.log('\n⚠️  Errors occurred:');
    results.filter(r => r.errors.length > 0).forEach(r => {
      console.log(`   ${r.email}: ${r.errors.join(', ')}`);
    });
  }

  console.log('\n✅ Deletion complete!');
}

// Run
main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
