/**
 * Create system_settings table using Supabase client
 * Run: node backend/create-system-settings-table.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in backend/.env');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase...');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const createTableSQL = `
-- Create the system_settings table to store global configurations
CREATE TABLE IF NOT EXISTS system_settings (
  id INT PRIMARY KEY,
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_system_settings_updated_at();

-- Insert a default row for settings. We'll use a single row with id = 1.
INSERT INTO system_settings (id, settings)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
`;

async function createTable() {
  try {
    console.log('📝 Creating system_settings table...');
    
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: createTableSQL 
    });

    if (error) {
      // If exec_sql function doesn't exist, we need to use a different approach
      console.log('⚠️  exec_sql function not available. You need to run this SQL manually in Supabase Dashboard:');
      console.log('');
      console.log('Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/editor');
      console.log('');
      console.log('Run the following SQL:');
      console.log('');
      console.log(createTableSQL);
      console.log('');
      process.exit(1);
    }

    console.log('✅ system_settings table created successfully!');
    console.log('📊 Data:', data);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('⚠️  Please run the following SQL manually in Supabase Dashboard:');
    console.log('');
    console.log('Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/editor');
    console.log('');
    console.log('Run the following SQL:');
    console.log('');
    console.log(createTableSQL);
    process.exit(1);
  }
}

createTable();
