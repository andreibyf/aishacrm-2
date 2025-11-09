import { getSupabaseClient, initSupabaseDB } from './lib/supabase-db.js';
import { promises as fs } from 'fs';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Client } = pkg;

// Load environment variables
dotenv.config();

async function applyMigration() {
  try {
    console.log('🔄 Applying migration: Make email optional for employees...\n');

    // Use direct PostgreSQL connection for DDL operations
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    await client.connect();
    console.log('✓ Connected to database\n');

    // Read the migration file
    const migrationSQL = await fs.readFile('./migrations/021_make_email_optional.sql', 'utf8');
    
    console.log('📝 Executing migration SQL...\n');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration applied successfully!\n');
    
    // Test the changes
    console.log('🧪 Testing: Creating employee without email...');
    
    initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = getSupabaseClient();
    
    const testEmployee = {
      tenant_id: 'local-tenant-001',
      first_name: 'Test',
      last_name: 'NoEmail',
      email: null,
      status: 'active',
      metadata: { test: true }
    };
    
    const { data, error } = await supabase
      .from('employees')
      .insert([testEmployee])
      .select()
      .single();
    
    if (error) {
      console.log('❌ Test failed:', error.message);
    } else {
      console.log('✅ Test passed: Employee created without email');
      console.log('   Employee ID:', data.id);
      
      // Clean up test data
      await supabase.from('employees').delete().eq('id', data.id);
      console.log('✓ Test data cleaned up\n');
    }
    
    await client.end();
    console.log('✓ Database connection closed\n');
    console.log('🎉 Migration complete! Email is now optional for employees.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
