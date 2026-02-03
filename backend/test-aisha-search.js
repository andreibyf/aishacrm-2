/**
 * Test AiSHA AI Assistant - Search for contacts and leads
 * This simulates a user asking AiSHA to find contacts/leads
 */

import fetch from 'node-fetch';

const TEST_TIMEOUT = 45000; // 45 seconds for AI responses
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

async function testAiSHA(query, description) {
  console.log(`\n🤖 Testing: ${description}`);
  console.log(`   Query: "${query}"`);
  console.log('   ...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT);

  try {
    const response = await fetch(`${BACKEND_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: query }
        ],
        tenant_id: TENANT_ID,
        user_id: 'test-user-integration',
        conversation_id: `test-conv-${Date.now()}`,
        session_entities: []
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`   ❌ HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`   Response: ${text.substring(0, 200)}`);
      return false;
    }

    const data = await response.json();
    
    // Check response structure
    if (data.response) {
      console.log(`   ✅ AiSHA responded:`);
      console.log(`   "${data.response.substring(0, 150)}${data.response.length > 150 ? '...' : ''}"`);
      
      // Check if tools were called
      if (data.tools_called && data.tools_called.length > 0) {
        console.log(`   🔧 Tools used: ${data.tools_called.join(', ')}`);
      }
      
      // Check for error indicators in response
      const hasError = data.response.toLowerCase().includes('error') || 
                      data.response.toLowerCase().includes('couldn\'t find') ||
                      data.response.toLowerCase().includes('unable to');
      
      if (hasError) {
        console.log(`   ⚠️  Response indicates potential issue`);
      } else {
        console.log(`   ✅ Successful response`);
      }
      
      return true;
    } else {
      console.error(`   ❌ Unexpected response structure:`, Object.keys(data));
      return false;
    }

  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error(`   ❌ Timeout after ${TEST_TIMEOUT}ms`);
    } else {
      console.error(`   ❌ Error: ${error.message}`);
    }
    return false;
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 Testing AiSHA AI Assistant - Contact & Lead Search');
  console.log('═══════════════════════════════════════════════════════════');

  const tests = [
    {
      query: 'Find contact named Carol Taylor',
      description: 'Search for specific contact by name'
    },
    {
      query: 'Search for a contact named Carol',
      description: 'Partial name search for contact'
    },
    {
      query: 'Show me all contacts',
      description: 'List all contacts'
    },
    {
      query: 'Find lead named Jimmy Jam',
      description: 'Search for specific lead by name'
    },
    {
      query: 'List all my leads',
      description: 'List all leads'
    },
    {
      query: 'Search for Jimmy',
      description: 'Generic search (should find leads/contacts)'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await testAiSHA(test.query, test.description);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠️  Some tests had issues. Check responses above.\n');
    process.exit(1);
  } else {
    console.log('✅ All AiSHA queries executed successfully!\n');
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite error:', err);
  process.exit(1);
});
