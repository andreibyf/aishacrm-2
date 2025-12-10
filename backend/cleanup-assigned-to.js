/**
 * Cleanup script to clear legacy email-based assigned_to values
 * Run with: node cleanup-assigned-to.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupAssignedTo() {
  console.log('Starting cleanup of legacy email-based assigned_to values...\n');
  
  const tables = ['contacts', 'leads', 'accounts', 'opportunities'];
  
  for (const table of tables) {
    try {
      // Just clear assigned_to (assigned_to_name may not exist on all tables)
      const { data: textData, error: textError } = await supabase
        .from(table)
        .update({ assigned_to: null })
        .like('assigned_to', '%@%')
        .select('id');
      
      if (textError) {
        // For UUID columns, this will fail - that's okay, the data is already valid
        console.log(`${table}: ${textError.message.includes('uuid') ? 'UUID column - no email data possible' : 'Error - ' + textError.message}`);
      } else {
        console.log(`${table}: ✓ Cleared ${textData?.length || 0} records`);
      }
    } catch (e) {
      console.log(`${table}: Exception - ${e.message}`);
    }
  }
  
  console.log('\nCleanup complete!');
}

cleanupAssignedTo().then(() => process.exit(0)).catch(e => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
