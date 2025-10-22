/**
 * getOrCreateUserApiKey
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has an API key
    const existingKeys = await base44.asServiceRole.entities.ApiKey.filter({
      created_by: user.email,
      key_name: 'AI Widget Key',
      is_active: true
    });

    if (existingKeys && existingKeys.length > 0) {
      // Return existing key
      return Response.json({
        apiKey: existingKeys[0].key_value,
        isNew: false
      });
    }

    // Generate new API key
    const newApiKey = crypto.randomUUID();

    // Store the API key
    const apiKeyRecord = await base44.asServiceRole.entities.ApiKey.create({
      key_name: 'AI Widget Key',
      key_value: newApiKey,
      description: 'API key for AI assistant widget',
      is_active: true,
      created_by: user.email,
      usage_count: 0
    });

    return Response.json({
      apiKey: newApiKey,
      isNew: true
    });

  } catch (error) {
    console.error('Error in getOrCreateUserApiKey:', error);
    return Response.json({ 
      error: 'Failed to get or create API key',
      details: error.message 
    }, { status: 500 });
  }
});

----------------------------

export default getOrCreateUserApiKey;
