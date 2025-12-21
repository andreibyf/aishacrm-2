/**
 * Test AI chat endpoint with account listing query
 */

import fetch from 'node-fetch';

async function testAIRevenue() {
  const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
  // Step 1: Create a conversation
  const createConvResponse = await fetch('http://localhost:4001/api/ai/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      title: 'Account Listing Test',
      mode: 'chat'
    })
  });

  const conversation = await createConvResponse.json();
  console.log('\n=== Created Conversation ===');
  console.log('ID:', conversation.data?.id);
  
  if (!conversation.data?.id) {
    console.error('Failed to create conversation:', conversation);
    return;
  }

  // Step 2: Send a message to the conversation
  const response = await fetch(`http://localhost:4001/api/ai/conversations/${conversation.data.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      role: 'user',
      content: 'List all accounts in our CRM. What accounts do we have?'
    })
  });

  const result = await response.json();
  
  console.log('\n=== AI Chat Response ===');
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(result, null, 2));
  
  if (result.reply) {
    console.log('\n=== AI Reply ===');
    console.log(result.reply);
  }
}

testAIRevenue().catch(console.error);
