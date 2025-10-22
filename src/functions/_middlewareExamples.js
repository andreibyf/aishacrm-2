/**
 * _middlewareExamples
 * Server-side function for your backend
 */

/**
 * EXAMPLES: How to use the centralized middleware utilities
 * 
 * These examples show common patterns for using the middleware functions
 * in your backend functions.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import {
  authenticateUser,
  requireRole,
  validateApiKey,
  validateTenantAccess,
  parseJsonBody,
  rateLimit,
  corsMiddleware,
  errorResponse,
  successResponse,
} from './_middleware.js';

/**
 * EXAMPLE 1: Simple authenticated endpoint
 * Use this for endpoints that require a logged-in user
 */
export function exampleAuthenticatedEndpoint() {
  return Deno.serve(async (req) => {
    // Authenticate user
    const { user, base44, error } = await authenticateUser(req);
    if (error) return error;

    // Your business logic here
    const data = await base44.entities.Lead.list();

    return successResponse({ leads: data });
  });
}

/**
 * EXAMPLE 2: Admin-only endpoint
 * Use this for endpoints that require admin role
 */
export function exampleAdminEndpoint() {
  return Deno.serve(async (req) => {
    // Authenticate user
    const { user, base44, error } = await authenticateUser(req);
    if (error) return error;

    // Check admin role
    const roleError = requireRole(user, ['admin', 'superadmin']);
    if (roleError) return roleError;

    // Your admin logic here
    const users = await base44.asServiceRole.entities.User.list();

    return successResponse({ users });
  });
}

/**
 * EXAMPLE 3: Webhook endpoint with API key validation
 * Use this for endpoints called by external services (n8n, Zapier, etc.)
 */
export function exampleWebhookEndpoint() {
  return Deno.serve(async (req) => {
    // Validate API key
    const apiKeyError = validateApiKey(req, 'N8N_API_KEY');
    if (apiKeyError) return apiKeyError;

    // Parse JSON body
    const { data, error } = await parseJsonBody(req);
    if (error) return error;

    // Initialize Base44 with service role
    const base44 = createClientFromRequest(req);

    // Your webhook logic here
    const lead = await base44.asServiceRole.entities.Lead.create({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      tenant_id: data.tenant_id,
    });

    return successResponse({ lead });
  });
}

/**
 * EXAMPLE 4: Tenant-scoped endpoint
 * Use this when you need to validate tenant access
 */
export function exampleTenantScopedEndpoint() {
  return Deno.serve(async (req) => {
    // Authenticate user
    const { user, base44, error } = await authenticateUser(req);
    if (error) return error;

    // Parse request body
    const { data: body, error: parseError } = await parseJsonBody(req);
    if (parseError) return parseError;

    // Validate tenant access
    const tenantError = validateTenantAccess(user, body.tenant_id);
    if (tenantError) return tenantError;

    // Your tenant-scoped logic here
    const contacts = await base44.entities.Contact.filter({
      tenant_id: body.tenant_id,
    });

    return successResponse({ contacts });
  });
}

/**
 * EXAMPLE 5: Rate-limited public endpoint
 * Use this for public endpoints that need rate limiting
 */
export function exampleRateLimitedEndpoint() {
  return Deno.serve(async (req) => {
    // Get identifier (IP or user)
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // Apply rate limit (100 requests per minute)
    const rateLimitError = rateLimit(ip, 100, 60000);
    if (rateLimitError) return rateLimitError;

    // Your public logic here
    return successResponse({ message: 'Public data' });
  });
}

/**
 * EXAMPLE 6: CORS-enabled endpoint
 * Use this for endpoints that need to be called from browser
 */
export function exampleCorsEndpoint() {
  const cors = corsMiddleware(['https://yourdomain.com']);

  return Deno.serve(async (req) => {
    // Handle preflight
    const preflight = cors.handlePreflight(req);
    if (preflight) return preflight;

    // Your logic here
    const response = successResponse({ data: 'some data' });

    // Add CORS headers to response
    return cors.addHeaders(response);
  });
}

/**
 * EXAMPLE 7: Complex endpoint with multiple middleware
 * Use this when you need to combine multiple checks
 */
export function exampleComplexEndpoint() {
  return Deno.serve(async (req) => {
    // 1. Authenticate user
    const { user, base44, error: authError } = await authenticateUser(req);
    if (authError) return authError;

    // 2. Check role
    const roleError = requireRole(user, ['admin', 'power-user']);
    if (roleError) return roleError;

    // 3. Rate limit
    const rateLimitError = rateLimit(user.email, 50, 60000);
    if (rateLimitError) return rateLimitError;

    // 4. Parse body
    const { data, error: parseError } = await parseJsonBody(req);
    if (parseError) return parseError;

    // 5. Validate tenant
    const tenantError = validateTenantAccess(user, data.tenant_id);
    if (tenantError) return tenantError;

    // Your complex business logic here
    try {
      const result = await base44.entities.SomeEntity.create(data);
      return successResponse({ result });
    } catch (err) {
      return errorResponse('Operation failed', 500, err.message);
    }
  });
}

// Export a dummy default to prevent deployment errors
export default {};

----------------------------

export default _middlewareExamples;
