/**
 * exampleUsingMiddleware
 * Server-side function for your backend
 */

/**
 * Example function showing how to use the new middleware utilities
 * This is a working example you can copy and modify
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import {
  authenticateUser,
  requireRole,
  parseJsonBody,
  errorResponse,
  successResponse,
} from './_middleware.js';

Deno.serve(async (req) => {
  try {
    // Step 1: Authenticate the user
    const { user, base44, error: authError } = await authenticateUser(req);
    if (authError) return authError;

    // Step 2: Check if user has required role (optional)
    const roleError = requireRole(user, ['admin', 'power-user']);
    if (roleError) return roleError;

    // Step 3: Parse request body (if needed)
    const { data, error: parseError } = await parseJsonBody(req);
    if (parseError) return parseError;

    // Step 4: Your business logic here
    const leads = await base44.entities.Lead.filter({
      tenant_id: user.tenant_id,
      status: data.status || 'new',
    });

    // Step 5: Return success response
    return successResponse({ 
      leads,
      count: leads.length 
    });

  } catch (error) {
    console.error('Function error:', error);
    return errorResponse('Internal server error', 500, error.message);
  }
});

----------------------------

export default exampleUsingMiddleware;
