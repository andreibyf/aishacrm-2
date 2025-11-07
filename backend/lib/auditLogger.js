/**
 * Audit Logger Helper
 * Simplifies audit log creation across routes
 */

/**
 * Create an audit log entry
 * @param {object} supabase - Supabase client instance
 * @param {object} params - Audit log parameters
 * @param {string} params.tenant_id - Tenant ID (use 'system' for global operations)
 * @param {string} params.user_email - Email of user performing action
 * @param {string} params.action - Action performed (create, update, delete)
 * @param {string} params.entity_type - Type of entity (user, tenant, etc.)
 * @param {string} params.entity_id - ID of the entity
 * @param {object} params.changes - Object containing changes made
 * @param {string} params.ip_address - IP address of request
 * @param {string} params.user_agent - User agent of request
 * @returns {Promise<void>}
 */
export async function createAuditLog(supabase, params) {
  try {
    const {
      tenant_id = 'system',
      user_email = 'system',
      action,
      entity_type,
      entity_id,
      changes = {},
      ip_address = null,
      user_agent = null,
    } = params;

    if (!action || !entity_type || !entity_id) {
      console.warn('[Audit] Missing required fields:', { action, entity_type, entity_id });
      return;
    }

    const auditLog = {
      tenant_id,
      user_email,
      action,
      entity_type,
      entity_id,
      changes,
      ip_address,
      user_agent,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('audit_log')
      .insert([auditLog]);

    if (error) {
      throw new Error(error.message);
    }

    console.log(`[AUDIT] ${action} ${entity_type}:${entity_id} by ${user_email}`);
  } catch (error) {
    console.error('[AUDIT] Failed to create audit log:', error.message);
    // Don't throw - audit logging should never break the main operation
  }
}

/**
 * Extract user email from request (from auth header, body, or query)
 * @param {object} req - Express request object
 * @returns {string} User email or 'system'
 */
export function getUserEmailFromRequest(req) {
  // Try to get from auth token if available
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-secret-key-change-in-production'
      );
      if (decoded?.email) return decoded.email;
    } catch {
      // Token verification failed, continue to fallback
    }
  }

  // Fallback to request body/query
  return req.body?.user_email || req.query?.user_email || 'system';
}

/**
 * Get client IP from request
 * @param {object} req - Express request object
 * @returns {string} IP address
 */
export function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown';
}
