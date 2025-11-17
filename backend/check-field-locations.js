// Check where fields are stored: direct columns vs metadata JSONB
import dotenv from 'dotenv';
import { initSupabaseDB, getSupabaseClient } from './lib/supabase-db.js';

dotenv.config();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
initSupabaseDB(url, key);
const supa = getSupabaseClient();

const TABLES = ['accounts', 'contacts', 'leads', 'opportunities', 'activities'];

async function checkFieldLocations() {
  console.log('\n📊 Field Location Report: Direct Columns vs Metadata JSONB\n');
  console.log('='.repeat(80));

  for (const table of TABLES) {
    console.log(`\n\n📋 TABLE: ${table.toUpperCase()}`);
    console.log('-'.repeat(80));

    try {
      // Get one record to inspect structure
      const { data, error } = await supa
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.error(`❌ Error querying ${table}:`, error.message);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`⚠️  No records found in ${table}`);
        continue;
      }

      const record = data[0];
      const directColumns = Object.keys(record).filter(k => k !== 'metadata');
      const metadata = record.metadata || {};
      const metadataFields = typeof metadata === 'object' ? Object.keys(metadata) : [];

      console.log('\n✅ Direct Columns:', directColumns.length);
      console.log(directColumns.join(', '));

      if (metadataFields.length > 0) {
        console.log('\n📦 Metadata Fields:', metadataFields.length);
        console.log(metadataFields.join(', '));
        
        console.log('\n📄 Sample Metadata Structure:');
        console.log(JSON.stringify(metadata, null, 2));
      } else {
        console.log('\n📦 Metadata: (empty or null)');
      }

    } catch (err) {
      console.error(`❌ Error processing ${table}:`, err.message);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 Field Reference Issues Found:\n');

  // Check common problematic fields
  const problematicFields = {
    accounts: ['owner_id', 'phone', 'num_employees'],
    contacts: ['job_title', 'phone', 'owner_id'],
    leads: ['phone', 'owner_id'],
    opportunities: ['owner_id'],
    activities: ['owner_id', 'related_to_type', 'related_to_id', 'body']
  };

  for (const [table, fields] of Object.entries(problematicFields)) {
    console.log(`\n${table}:`);
    
    try {
      const { data } = await supa.from(table).select('*').limit(1);
      if (!data || data.length === 0) continue;
      
      const record = data[0];
      const directCols = Object.keys(record).filter(k => k !== 'metadata');
      const metadataKeys = record.metadata && typeof record.metadata === 'object' 
        ? Object.keys(record.metadata) 
        : [];

      for (const field of fields) {
        const inDirect = directCols.includes(field);
        const inMetadata = metadataKeys.includes(field);
        
        if (inDirect) {
          console.log(`  ✅ ${field}: Direct column`);
        } else if (inMetadata) {
          console.log(`  📦 ${field}: In metadata JSONB`);
        } else {
          console.log(`  ❌ ${field}: NOT FOUND (neither direct nor metadata)`);
        }
      }
    } catch (err) {
      console.error(`  Error checking ${table}:`, err.message);
    }
  }

  console.log('\n' + '='.repeat(80));
}

checkFieldLocations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
