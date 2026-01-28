/**
 * Braid Policies Module
 * Security policies and access control definitions for tool execution
 */

/**
 * CRM Security Policies
 * Define what each policy allows and restricts
 */
export const CRM_POLICIES = {
  READ_ONLY: {
    name: 'Read Only',
    description: 'Can read data but cannot create, update, or delete',
    tool_class: 'read_operations',
    allows: ['GET', 'LIST', 'SEARCH', 'VIEW'],
    denies: ['POST', 'PUT', 'PATCH', 'DELETE'],
    required_roles: [], // All roles allowed
    rate_limit: {
      requests_per_minute: 100
    },
    context: {
      tenant_isolation: true,
      user_data_scope: false // Can see all tenant data
    }
  },

  WRITE_OPERATIONS: {
    name: 'Write Operations',
    description: 'Can create, read, and update data but cannot delete',
    tool_class: 'write_operations',
    allows: ['GET', 'LIST', 'SEARCH', 'VIEW', 'POST', 'PUT', 'PATCH'],
    denies: ['DELETE'],
    required_roles: ['user', 'manager', 'admin', 'superadmin'],
    rate_limit: {
      requests_per_minute: 50
    },
    context: {
      tenant_isolation: true,
      user_data_scope: false,
      audit_required: true
    }
  },

  DELETE_OPERATIONS: {
    name: 'Delete Operations',
    description: 'Full CRUD access including delete operations',
    tool_class: 'delete_operations',
    allows: ['GET', 'LIST', 'SEARCH', 'VIEW', 'POST', 'PUT', 'PATCH', 'DELETE'],
    denies: [],
    required_roles: ['manager', 'admin', 'superadmin'],
    requires_confirmation: true,
    rate_limit: {
      requests_per_minute: 20
    },
    context: {
      tenant_isolation: true,
      user_data_scope: false,
      audit_required: true,
      delete_confirmation: true
    }
  },

  ADMIN_ONLY: {
    name: 'Admin Only',
    description: 'Administrative operations requiring elevated privileges',
    tool_class: 'admin_operations',
    allows: ['GET', 'LIST', 'SEARCH', 'VIEW', 'POST', 'PUT', 'PATCH', 'DELETE', 'ADMIN'],
    denies: [],
    required_roles: ['admin', 'superadmin'],
    requires_confirmation: true,
    rate_limit: {
      requests_per_minute: 30
    },
    context: {
      tenant_isolation: true,
      user_data_scope: false,
      audit_required: true,
      admin_approval: true
    }
  },

  SYSTEM_INTERNAL: {
    name: 'System Internal',
    description: 'Internal system operations not exposed to users',
    tool_class: 'system_operations',
    allows: ['SYSTEM'],
    denies: ['USER_FACING'],
    required_roles: ['system'],
    rate_limit: {
      requests_per_minute: 200
    },
    context: {
      tenant_isolation: false, // System operations may cross tenants
      user_data_scope: false,
      audit_required: false
    }
  },

  AI_SUGGESTIONS: {
    name: 'AI Suggestions',
    description: 'AI-powered suggestion operations with approval workflow',
    tool_class: 'ai_operations',
    allows: ['GET', 'LIST', 'SEARCH', 'VIEW', 'POST', 'PUT', 'PATCH'],
    denies: ['DELETE'],
    required_roles: ['user', 'manager', 'admin', 'superadmin'],
    rate_limit: {
      requests_per_minute: 40
    },
    context: {
      tenant_isolation: true,
      user_data_scope: false,
      audit_required: true,
      ai_suggestion_workflow: true
    }
  },

  EXTERNAL_API: {
    name: 'External API Access',
    description: 'Tools that make external API calls (web research, telephony)',
    tool_class: 'external_operations',
    allows: ['GET', 'POST'],
    denies: [],
    required_roles: ['user', 'manager', 'admin', 'superadmin'],
    rate_limit: {
      requests_per_minute: 10 // Lower limit for external APIs
    },
    context: {
      tenant_isolation: true,
      user_data_scope: false,
      audit_required: true,
      external_api_usage: true
    }
  }
};

/**
 * Role hierarchy levels for permission checking
 */
export const ROLE_HIERARCHY = {
  user: 1,
  manager: 2,
  admin: 3,
  superadmin: 4,
  system: 5
};

/**
 * Check if a user role has permission for a policy
 * @param {string} userRole - User's role
 * @param {string} policyName - Policy to check
 * @returns {boolean} True if user has permission
 */
export function checkRolePermission(userRole, policyName) {
  const policy = CRM_POLICIES[policyName];
  if (!policy || !policy.required_roles || policy.required_roles.length === 0) {
    return true; // No role restrictions
  }

  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevels = policy.required_roles.map(role => ROLE_HIERARCHY[role] || 0);
  
  return requiredLevels.some(level => userLevel >= level);
}

/**
 * Get the minimum role required for a policy
 * @param {string} policyName - Policy name
 * @returns {string|null} Minimum required role
 */
export function getMinimumRole(policyName) {
  const policy = CRM_POLICIES[policyName];
  if (!policy || !policy.required_roles || policy.required_roles.length === 0) {
    return null;
  }

  // Find the role with the lowest hierarchy level
  let minRole = null;
  let minLevel = Infinity;

  for (const role of policy.required_roles) {
    const level = ROLE_HIERARCHY[role] || 0;
    if (level < minLevel) {
      minLevel = level;
      minRole = role;
    }
  }

  return minRole;
}

/**
 * Get rate limit for a policy
 * @param {string} policyName - Policy name
 * @returns {number} Requests per minute limit
 */
export function getRateLimit(policyName) {
  const policy = CRM_POLICIES[policyName];
  return policy?.rate_limit?.requests_per_minute || 50; // Default limit
}

/**
 * Check if a policy requires confirmation for destructive operations
 * @param {string} policyName - Policy name
 * @returns {boolean} True if confirmation required
 */
export function requiresConfirmation(policyName) {
  const policy = CRM_POLICIES[policyName];
  return policy?.requires_confirmation || false;
}

/**
 * Get audit requirements for a policy
 * @param {string} policyName - Policy name
 * @returns {boolean} True if audit logging required
 */
export function requiresAudit(policyName) {
  const policy = CRM_POLICIES[policyName];
  return policy?.context?.audit_required || false;
}

/**
 * Get tool class for rate limiting
 * @param {string} policyName - Policy name
 * @returns {string} Tool class identifier
 */
export function getToolClass(policyName) {
  const policy = CRM_POLICIES[policyName];
  return policy?.tool_class || 'default';
}

/**
 * Validate that an operation is allowed by policy
 * @param {string} policyName - Policy name
 * @param {string} operation - HTTP method or operation type
 * @returns {boolean} True if operation is allowed
 */
export function isOperationAllowed(policyName, operation) {
  const policy = CRM_POLICIES[policyName];
  if (!policy) return false;

  const upperOp = operation.toUpperCase();
  
  // Check if explicitly denied
  if (policy.denies.includes(upperOp)) {
    return false;
  }

  // Check if explicitly allowed
  return policy.allows.includes(upperOp);
}

/**
 * Get policy context for a tool execution
 * @param {string} policyName - Policy name
 * @param {Object} additionalContext - Additional context to merge
 * @returns {Object} Policy context object
 */
export function getPolicyContext(policyName, additionalContext = {}) {
  const policy = CRM_POLICIES[policyName];
  const baseContext = policy?.context || {};

  return {
    ...baseContext,
    ...additionalContext,
    policy: policyName,
    timestamp: new Date().toISOString()
  };
}

/**
 * List all available policies with their metadata
 * @returns {Array} Policy metadata array
 */
export function listPolicies() {
  return Object.entries(CRM_POLICIES).map(([name, policy]) => ({
    name,
    displayName: policy.name,
    description: policy.description,
    toolClass: policy.tool_class,
    requiredRoles: policy.required_roles || [],
    minimumRole: getMinimumRole(name),
    rateLimit: policy.rate_limit?.requests_per_minute || 50,
    requiresConfirmation: policy.requires_confirmation || false,
    allowedOperations: policy.allows,
    deniedOperations: policy.denies
  }));
}