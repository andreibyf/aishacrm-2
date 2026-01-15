/**
 * Back-compat shim.
 * Canonical contracts live in: shared/contracts/agents.js
 */
export * from '../../../shared/contracts/agents.js';

/**
 * Default Escalation Rules by Role
 */
export const DefaultEscalationRules = Object.freeze({
  [AgentRoles.OPS_MANAGER]: [
    // Ops manager rarely escalates - only for critical failures
    {
      trigger: EscalationTriggers.ERROR_THRESHOLD,
      target_role: null, // Human escalation
      reason_template: 'Critical error threshold reached: {error_count} errors in {window}',
      requires_approval: true,
      priority: 1,
    },
  ],
  [AgentRoles.SALES_MANAGER]: [
    {
      trigger: EscalationTriggers.CONFIDENCE_LOW,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'Sales decision confidence below threshold: {confidence}%',
      requires_approval: false,
      priority: 10,
    },
    {
      trigger: EscalationTriggers.APPROVAL_REQUIRED,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'High-value action requires approval: {action}',
      requires_approval: true,
      priority: 5,
    },
  ],
  [AgentRoles.SDR]: [
    {
      trigger: EscalationTriggers.CONFIDENCE_LOW,
      target_role: AgentRoles.SALES_MANAGER,
      reason_template: 'SDR confidence below threshold: {confidence}%',
      requires_approval: false,
      priority: 10,
    },
    {
      trigger: EscalationTriggers.SCOPE_EXCEEDED,
      target_role: AgentRoles.SALES_MANAGER,
      reason_template: 'Task requires deal management: {task_summary}',
      requires_approval: false,
      priority: 5,
    },
    {
      trigger: EscalationTriggers.TOOL_BLOCKED,
      target_role: AgentRoles.SALES_MANAGER,
      reason_template: 'Required tool not in allowlist: {tool}',
      requires_approval: false,
      priority: 8,
    },
  ],
  [AgentRoles.PROJECT_MANAGER]: [
    {
      trigger: EscalationTriggers.CONFIDENCE_LOW,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'PM confidence below threshold: {confidence}%',
      requires_approval: false,
      priority: 10,
    },
    {
      trigger: EscalationTriggers.TIMEOUT,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'Task timed out after {duration}s',
      requires_approval: false,
      priority: 3,
    },
  ],
  [AgentRoles.MARKETING_MANAGER]: [
    {
      trigger: EscalationTriggers.CONFIDENCE_LOW,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'Marketing decision confidence below threshold: {confidence}%',
      requires_approval: false,
      priority: 10,
    },
    {
      trigger: EscalationTriggers.APPROVAL_REQUIRED,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'Campaign launch requires approval: {campaign}',
      requires_approval: true,
      priority: 5,
    },
  ],
  [AgentRoles.CUSTOMER_SERVICE_MANAGER]: [
    {
      trigger: EscalationTriggers.CONFIDENCE_LOW,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'CS confidence below threshold: {confidence}%',
      requires_approval: false,
      priority: 10,
    },
    {
      trigger: EscalationTriggers.SCOPE_EXCEEDED,
      target_role: AgentRoles.SALES_MANAGER,
      reason_template: 'Issue requires sales intervention: {issue_summary}',
      requires_approval: false,
      priority: 5,
    },
    {
      trigger: EscalationTriggers.APPROVAL_REQUIRED,
      target_role: AgentRoles.OPS_MANAGER,
      reason_template: 'Refund or compensation requires approval: {amount}',
      requires_approval: true,
      priority: 3,
    },
  ],
});

/**
 * Agent Schema Validation
 */
export const AgentSchema = Object.freeze({
  id: { type: 'string', required: true, pattern: /^[a-z_]+(:[\w-]+)?$/ },
  role: { type: 'string', required: true, enum: Object.values(AgentRoles) },
  display_name: { type: 'string', required: true },
  model: { type: 'string', required: true },
  temperature: { type: 'number', required: true, min: 0, max: 1 },
  tool_allowlist: { type: 'array', required: true, items: 'string' },
  memory_namespace: { type: 'string', required: true },
  escalation_rules: { type: 'array', required: true, items: 'EscalationRule' },
  metadata: { type: 'object', required: false },
});

/**
 * Validate an agent object against the schema
 * @param {Object} agent - Agent object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgent(agent) {
  const errors = [];

  if (!agent || typeof agent !== 'object') {
    return { valid: false, errors: ['Agent must be an object'] };
  }

  // Check required fields
  if (!agent.id || typeof agent.id !== 'string') {
    errors.push('Agent id is required and must be a string');
  } else if (!AgentSchema.id.pattern.test(agent.id)) {
    errors.push(`Agent id must match pattern: ${AgentSchema.id.pattern}`);
  }

  if (!agent.role || !Object.values(AgentRoles).includes(agent.role)) {
    errors.push(`Agent role must be one of: ${Object.values(AgentRoles).join(', ')}`);
  }

  if (!agent.display_name || typeof agent.display_name !== 'string') {
    errors.push('Agent display_name is required and must be a string');
  }

  if (!agent.model || typeof agent.model !== 'string') {
    errors.push('Agent model is required and must be a string');
  }

  if (typeof agent.temperature !== 'number' || agent.temperature < 0 || agent.temperature > 1) {
    errors.push('Agent temperature is required and must be a number between 0 and 1');
  }

  if (!Array.isArray(agent.tool_allowlist)) {
    errors.push('Agent tool_allowlist is required and must be an array');
  }

  if (!agent.memory_namespace || typeof agent.memory_namespace !== 'string') {
    errors.push('Agent memory_namespace is required and must be a string');
  }

  if (!Array.isArray(agent.escalation_rules)) {
    errors.push('Agent escalation_rules is required and must be an array');
  } else {
    agent.escalation_rules.forEach((rule, i) => {
      if (!rule.trigger || !Object.values(EscalationTriggers).includes(rule.trigger)) {
        errors.push(`escalation_rules[${i}].trigger must be one of: ${Object.values(EscalationTriggers).join(', ')}`);
      }
      // target_role can be null (human escalation) or a valid role
      if (rule.target_role !== null && !Object.values(AgentRoles).includes(rule.target_role)) {
        errors.push(`escalation_rules[${i}].target_role must be null or one of: ${Object.values(AgentRoles).join(', ')}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate agent ID from role and optional tenant
 * @param {string} role - Agent role
 * @param {string} [tenant_id] - Optional tenant ID
 * @returns {string}
 */
export function generateAgentId(role, tenant_id = null) {
  if (tenant_id) {
    return `${role}:${tenant_id}`;
  }
  return role;
}

/**
 * Parse agent ID into role and tenant
 * @param {string} agent_id - Agent ID
 * @returns {{ role: string, tenant_id: string | null }}
 */
export function parseAgentId(agent_id) {
  const parts = agent_id.split(':');
  return {
    role: parts[0],
    tenant_id: parts.length > 1 ? parts.slice(1).join(':') : null,
  };
}
