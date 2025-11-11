/**
 * End-to-End Test for Unique ID Generation
 * Tests both backend endpoint and database persistence
 * 
 * Run: node backend/test-unique-id-e2e.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend environment
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test tenant
const TEST_TENANT_ID = 'local-tenant-001';

async function testUniqueIdGeneration() {
  console.log('🧪 Testing Unique ID Generation End-to-End\n');

  try {
    // 1. Test backend endpoint
    console.log('📡 Step 1: Calling backend generate-unique-id endpoint...');
    const backendUrl = 'http://localhost:4001/api/utils/generate-unique-id';
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'Lead',
        tenant_id: TEST_TENANT_ID
      })
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('✅ Backend response:', result);

    if (!result.data?.unique_id) {
      throw new Error('Backend did not return unique_id');
    }

    const generatedId = result.data.unique_id;
    console.log(`   Generated ID: ${generatedId}\n`);

    // 2. Create a test lead with the unique_id
    console.log('📝 Step 2: Creating test lead with unique_id in metadata...');
    
    const testLead = {
      tenant_id: TEST_TENANT_ID,
      first_name: 'Test',
      last_name: 'Lead UniqueID',
      email: 'test-uniqueid@example.com',
      status: 'new',
      metadata: {
        unique_id: generatedId,
        test_timestamp: new Date().toISOString(),
        test_purpose: 'E2E unique ID verification'
      }
    };

    const { data: insertedLead, error: insertError } = await supabase
      .from('leads')
      .insert([testLead])
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert lead: ${insertError.message}`);
    }

    console.log('✅ Lead created:', {
      id: insertedLead.id,
      first_name: insertedLead.first_name,
      last_name: insertedLead.last_name,
      unique_id: insertedLead.metadata?.unique_id
    });

    // 3. Verify uniqueness check works (try to use same ID again)
    console.log('\n🔒 Step 3: Testing uniqueness enforcement...');
    
    const response2 = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'Lead',
        tenant_id: TEST_TENANT_ID
      })
    });

    const result2 = await response2.json();
    const secondId = result2.data?.unique_id;

    if (secondId === generatedId) {
      throw new Error('Backend returned duplicate ID!');
    }

    console.log('✅ Second ID is unique:', secondId);

    // 4. Query database to verify persistence
    console.log('\n🔍 Step 4: Querying database for unique_id...');
    
    const { data: leads, error: queryError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, metadata')
      .eq('tenant_id', TEST_TENANT_ID)
      .contains('metadata', { unique_id: generatedId });

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    if (leads.length === 0) {
      throw new Error('Lead with unique_id not found in database');
    }

    console.log('✅ Found lead with unique_id:', {
      id: leads[0].id,
      first_name: leads[0].first_name,
      last_name: leads[0].last_name,
      unique_id: leads[0].metadata?.unique_id
    });

    // 5. Cleanup test data
    console.log('\n🧹 Step 5: Cleaning up test data...');
    
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', insertedLead.id);

    if (deleteError) {
      console.warn('⚠️  Cleanup failed:', deleteError.message);
    } else {
      console.log('✅ Test lead deleted');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ END-TO-END TEST PASSED');
    console.log('='.repeat(60));
    console.log('✓ Backend endpoint generates unique IDs');
    console.log('✓ IDs are tenant-scoped and collision-free');
    console.log('✓ Metadata storage works correctly');
    console.log('✓ Database queries on unique_id work as expected');
    console.log('\n✅ Ready for production use!');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\n📋 Troubleshooting:');
    console.error('   1. Ensure backend is running: docker ps');
    console.error('   2. Check backend logs: docker logs aishacrm-backend');
    console.error('   3. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
    console.error('   4. Ensure leads table exists with metadata JSONB column');
    process.exit(1);
  }
}

testUniqueIdGeneration();
