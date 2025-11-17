/**
 * Sync User to Supabase Auth
 * 
 * This script creates a Supabase Auth account for users who exist in public.users
 * but are missing from auth.users (orphaned database records).
 * 
 * Usage: node sync-user-to-auth.js <email>
 * Example: node sync-user-to-auth.js andrei.byfield@gmail.com
 */

import pg from 'pg';
import { inviteUserByEmail } from './lib/supabaseAuth.js';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function syncUserToAuth(email) {
  try {
    console.log(`\n🔍 Searching for user: ${email}`);

    // Find user in public.users table
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, tenant_id, display_name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      console.error(`❌ User not found in public.users table: ${email}`);
      process.exit(1);
    }

    const user = result.rows[0];
    console.log(`✅ Found user in database:`, {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      role: user.role,
      tenant_id: user.tenant_id,
    });

    // Create Supabase Auth account and send invitation
    console.log(`\n📧 Creating Supabase Auth account and sending invitation...`);
    
    const metadata = {
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      tenant_id: user.tenant_id,
      display_name: user.display_name || `${user.first_name} ${user.last_name || ''}`.trim(),
    };

    const { data, error } = await inviteUserByEmail(user.email, metadata);

    if (error) {
      if (error.message?.includes('already been registered')) {
        console.log(`ℹ️  User already exists in Supabase Auth - sending password reset instead`);
        // Import sendPasswordResetEmail if needed
        const { sendPasswordResetEmail } = await import('./lib/supabaseAuth.js');
        const resetResult = await sendPasswordResetEmail(user.email);
        
        if (resetResult.error) {
          console.error(`❌ Failed to send password reset:`, resetResult.error);
          process.exit(1);
        }
        
        console.log(`✅ Password reset email sent to ${user.email}`);
        console.log(`   Check your email and click the reset link`);
      } else {
        console.error(`❌ Failed to create auth account:`, error);
        process.exit(1);
      }
    } else {
      console.log(`✅ Supabase Auth account created successfully!`);
      console.log(`✅ Invitation email sent to ${user.email}`);
      console.log(`\nℹ️  User should check their email and click the invitation link to:`);
      console.log(`   1. Set their password`);
      console.log(`   2. Confirm their email`);
      console.log(`   3. Gain access to the CRM`);
      console.log(`\n📨 Auth user data:`, data);
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error(`\n💥 Error:`, error);
    await pool.end();
    process.exit(1);
  }
}

// Parse command line arguments
const email = process.argv[2];

if (!email) {
  console.error(`
Usage: node sync-user-to-auth.js <email>

Example:
  node sync-user-to-auth.js andrei.byfield@gmail.com

This script will:
  1. Find the user in public.users table
  2. Create a Supabase Auth account
  3. Send an invitation email with magic link
  `);
  process.exit(1);
}

syncUserToAuth(email);
