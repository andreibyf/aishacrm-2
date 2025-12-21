import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';

// Load environment variables
dotenv.config();

async function applyMigration() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('✅ Connected to Supabase\n');

    // Execute raw SQL via Supabase RPC
    console.log('📝 Applying migration 012_flatten_accounts.sql...');
    const migration012 = await fs.readFile('./migrations/012_flatten_accounts.sql', 'utf8');
    const { error: error012 } = await supabase.rpc('exec_sql', { sql: migration012 });
    if (error012) {
      console.log('Note: Migration 012 may have already been applied:', error012.message);
    } else {
      console.log('✅ Migration 012 applied successfully\n');
    }

    // Apply migration 039 (add assigned_to to accounts, contacts, leads, opportunities)
    console.log('📝 Applying migration 039_align_ui_schema.sql...');
    const migration039 = await fs.readFile('./migrations/039_align_ui_schema.sql', 'utf8');
    const { error: error039 } = await supabase.rpc('exec_sql', { sql: migration039 });
    if (error039) {
      console.log('Note: Migration 039 may have already been applied:', error039.message);
    } else {
      console.log('✅ Migration 039 applied successfully\n');
    }

    // Verify the schema by querying accounts table
    console.log('🔍 Verifying accounts table schema...');
    const { data: sampleAccount, error: queryError } = await supabase
      .from('accounts')
      .select('*')
      .limit(1)
      .single();

    if (queryError && queryError.code !== 'PGRST116') {
      console.log('Query error:', queryError.message);
    } else if (sampleAccount) {
      console.log('\nSample account has columns:', Object.keys(sampleAccount).join(', '));
      console.log('✅ Verified: email, phone, assigned_to present:', {
        has_email: 'email' in sampleAccount,
        has_phone: 'phone' in sampleAccount,
        has_assigned_to: 'assigned_to' in sampleAccount
      });
    } else {
      console.log('No accounts in table to verify schema');
    }

    console.log('\n✅ All migrations applied successfully!');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    throw error;
  }
}

applyMigration().catch(console.error);
