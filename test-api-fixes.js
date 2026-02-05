// Test both API fixes
const BASE_URL = 'http://localhost:4001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Service role key from Doppler
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

async function testDocumentsV2() {
  console.log('\n=== Testing Documents v2 Create ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/v2/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        name: 'test-doc-phase11.pdf',
        file_type: 'application/pdf',
        file_size: 1024,
        file_url: 'https://example.com/test.pdf'
      })
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Result:', JSON.stringify(data, null, 2).substring(0, 500));
    
    if (response.status === 201) {
      console.log('✅ Documents v2 CREATE works!');
      return data.data?.document?.id;
    } else {
      console.log('❌ Documents v2 CREATE failed:', data.message);
    }
  } catch (error) {
    console.log('❌ Documents v2 error:', error.message);
  }
}

async function testDocumentsV2Get(docId) {
  if (!docId) return;
  
  console.log('\n=== Testing Documents v2 Get ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/v2/documents/${docId}?tenant_id=${TENANT_ID}`, {
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY
      }
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Has aiContext:', !!data.data?.aiContext);
    
    if (response.status === 200) {
      console.log('✅ Documents v2 GET works!');
    }
  } catch (error) {
    console.log('❌ Documents v2 GET error:', error.message);
  }
}

async function testDashboardStats() {
  console.log('\n=== Testing Dashboard Stats with aiContext ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/reports/dashboard-stats?tenant_id=${TENANT_ID}`);
    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Has aiContext:', !!data.data?.aiContext);
    
    if (data.data?.aiContext) {
      console.log('aiContext fields:', Object.keys(data.data.aiContext));
      console.log('Health Score:', data.data.aiContext.healthScore);
      console.log('Insights count:', data.data.aiContext.insights?.length || 0);
      console.log('Suggestions count:', data.data.aiContext.suggestions?.length || 0);
      console.log('Sample insight:', data.data.aiContext.insights?.[0]);
      console.log('✅ Dashboard stats aiContext works!');
    } else {
      console.log('❌ Dashboard stats missing aiContext');
    }
  } catch (error) {
    console.log('❌ Dashboard stats error:', error.message);
  }
}

async function main() {
  console.log('Testing API fixes...');
  console.log('Backend:', BASE_URL);
  console.log('Tenant:', TENANT_ID);
  
  const docId = await testDocumentsV2();
  await testDocumentsV2Get(docId);
  await testDashboardStats();
  
  console.log('\n=== Test Complete ===\n');
}

main();
