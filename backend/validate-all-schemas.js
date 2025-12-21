import { getSupabaseClient, initSupabaseDB } from './lib/supabase-db.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function validateAllSchemas() {
  try {
    console.log('🔍 VALIDATING ALL ENTITY SCHEMAS\n');
    console.log('='  .repeat(80) + '\n');

    initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = getSupabaseClient();

    const entities = ['accounts', 'contacts', 'leads', 'opportunities', 'employees'];

    for (const entity of entities) {
      console.log(`\n📋 ${entity.toUpperCase()} TABLE:\n`);
      console.log('-'.repeat(80));

      // Fetch a sample record to see actual schema
      const { data, error } = await supabase
        .from(entity)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ Error fetching ${entity}:`, error.message);
        continue;
      }

      if (data && data.length > 0) {
        const columns = Object.keys(data[0]);
        console.log(`✅ Columns (${columns.length}):`);
        columns.forEach(col => {
          const value = data[0][col];
          const type = value === null ? 'NULL' : typeof value;
          console.log(`   ${col.padEnd(30)} ${type}`);
        });
        
        // Show metadata structure if exists
        if (data[0].metadata && typeof data[0].metadata === 'object') {
          const metadataKeys = Object.keys(data[0].metadata);
          if (metadataKeys.length > 0) {
            console.log(`\n   📦 metadata contains: ${metadataKeys.join(', ')}`);
          }
        }
      } else {
        console.log(`ℹ️  No records found in ${entity} table`);
        
        // Try to get schema from information_schema
        console.log(`   Attempting to describe table structure...`);
      }

      console.log('-'.repeat(80));
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('📝 SUMMARY & RECOMMENDATIONS:\n');

    console.log('Based on employee form pattern, each entity should:');
    console.log('1. ✅ Store core fields as direct columns (id, tenant_id, name/first_name/last_name)');
    console.log('2. ✅ Store all additional fields in metadata JSONB column');
    console.log('3. ✅ Frontend forms should mark only required fields with red asterisk (*)');
    console.log('4. ✅ Backend routes should extract core fields and store rest in metadata');
    console.log('5. ✅ Database constraints should only enforce truly required fields\n');

    console.log('🎯 REQUIRED FIELDS BY ENTITY (based on business logic):');
    console.log('   accounts:      name, tenant_id');
    console.log('   contacts:      first_name OR last_name, tenant_id');
    console.log('   leads:         first_name OR last_name, tenant_id');
    console.log('   opportunities: name, tenant_id');
    console.log('   employees:     first_name, last_name, tenant_id');
    console.log('                  email (only if has_crm_access = true)\n');

    console.log('⚠️  FIELDS THAT SHOULD BE OPTIONAL:');
    console.log('   - email (all entities except when CRM access enabled)');
    console.log('   - phone');
    console.log('   - website');
    console.log('   - industry, type, status (can have defaults)');
    console.log('   - All address fields');
    console.log('   - All date fields (except created_at/updated_at)\n');

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

validateAllSchemas();
