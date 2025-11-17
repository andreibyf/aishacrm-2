import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: resolve(__dirname, '../backend/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearTestData() {
  console.log('🧹 Clearing test data from database...\n');

  const tables = ['activities', 'notes', 'opportunities', 'contacts', 'accounts', 'leads'];

  for (const table of tables) {
    try {
      // Delete records where email contains @acmecorp.test
      const { error } = await supabase
        .from(table)
        .delete()
        .like('email', '%@acmecorp.test');

      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: cleaned`);
      }
    } catch (err) {
      console.log(`⚠️  ${table}: ${err.message}`);
    }
  }

  console.log('\n✨ Test data cleanup complete!\n');
}

clearTestData().catch(console.error);
