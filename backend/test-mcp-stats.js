import 'dotenv/config';

async function testMCPStats() {
  const backendUrl = 'http://localhost:4001';
  
  console.log('\n🔍 Testing MCP get_tenant_stats Tool\n');

  const tenantIds = ['labor-depot', 'local-tenant-001'];

  for (const tenantId of tenantIds) {
    console.log(`\nTesting tenant: ${tenantId}`);
    
    try {
      const response = await fetch(`${backendUrl}/api/mcp/execute-tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          server_id: 'crm',
          tool_name: 'crm.get_tenant_stats',
          parameters: {
            tenant_id: tenantId
          }
        })
      });

      if (!response.ok) {
        console.log(`HTTP Error: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log('Response:', text);
        continue;
      }

      const result = await response.json();
      console.log('MCP Response:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  console.log('\n---\n');
}

testMCPStats();
