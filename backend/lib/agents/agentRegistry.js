/**
 * Agent Registry
 *
 * Stores per-role agent configuration with formal identity schema.
 * Imports canonical contract from agent-office addon.
 * 
 * Later: per-tenant DB overrides and UI editor.
 */

import {
  AgentRoles,
  DefaultEscalationRules,
  EscalationTriggers,
  generateAgentId,
  parseAgentId,
  validateAgent,
} from './contracts/agents.js';

// Re-export for convenience
export { AgentRoles, EscalationTriggers, generateAgentId, parseAgentId, validateAgent };

/**
 * Canonical role list (derived from contract)
 */
export const ROLES = Object.values(AgentRoles);

/**
 * Build a full agent profile for a role
 * @param {string} role - Agent role
 * @param {string} [tenant_id] - Optional tenant ID for scoped agent
 * @returns {Object} Full agent profile conforming to Agent schema
 */
export function getDefaultAgentProfile(role, tenant_id = null) {
  const id = generateAgentId(role, tenant_id);
  const escalation_rules = DefaultEscalationRules[role] || [];

  const base = {
    id,
    role,
    display_name: role,
    model: process.env.DEFAULT_AI_MODEL || 'gpt-4o-mini',
    temperature: 0.4,
    tool_allowlist: [],
    memory_namespace: role,
    escalation_rules,
    metadata: {
      avatar: '🤖',
      color: '#6366f1',
      capabilities: [],
      limits: {
        max_tokens_per_request: 4096,
        max_requests_per_minute: 60,
      },
    },
  };

  switch (role) {
    case AgentRoles.OPS_MANAGER:
      return {
        ...base,
        display_name: 'AiSHA (Ops Manager)',
        model: process.env.AISHA_OPS_MODEL || base.model,
        temperature: 0.2,
        tool_allowlist: ['create_task', 'assign_task', 'handoff', 'approve', 'summarize', 'route_request'],
        memory_namespace: 'ops',
        metadata: {
          ...base.metadata,
          avatar: '👩‍💼',
          color: '#8b5cf6',
          capabilities: ['orchestration', 'task_management', 'delegation', 'oversight'],
        },
      };

    case AgentRoles.SALES_MANAGER:
      return {
        ...base,
        display_name: 'Sales Manager',
        model: process.env.AISHA_SALES_MODEL || 'gpt-4o',
        temperature: 0.35,
        tool_allowlist: ['crm_query', 'draft_email', 'summarize', 'create_task', 'handoff', 'update_opportunity'],
        memory_namespace: 'sales',
        metadata: {
          ...base.metadata,
          avatar: '💼',
          color: '#10b981',
          capabilities: ['deal_management', 'pipeline_analysis', 'forecasting', 'negotiation'],
        },
      };

    case AgentRoles.SDR:
      return {
        ...base,
        display_name: 'SDR',
        model: process.env.AISHA_SDR_MODEL || base.model,
        temperature: 0.6,
        tool_allowlist: ['crm_query', 'enrich', 'draft_email', 'summarize', 'handoff', 'create_lead'],
        memory_namespace: 'sdr',
        metadata: {
          ...base.metadata,
          avatar: '📞',
          color: '#f59e0b',
          capabilities: ['prospecting', 'outreach', 'lead_qualification', 'research'],
        },
      };

    case AgentRoles.PROJECT_MANAGER:
      return {
        ...base,
        display_name: 'Project Manager',
        model: process.env.AISHA_PM_MODEL || 'gpt-4o',
        temperature: 0.25,
        tool_allowlist: ['crm_query', 'create_task', 'update_task', 'summarize', 'handoff', 'create_activity'],
        memory_namespace: 'pm',
        metadata: {
          ...base.metadata,
          avatar: '📋',
          color: '#3b82f6',
          capabilities: ['scheduling', 'milestone_tracking', 'resource_planning', 'status_reporting'],
        },
      };

    case AgentRoles.MARKETING_MANAGER:
      return {
        ...base,
        display_name: 'Marketing Manager',
        model: process.env.AISHA_MKT_MODEL || 'gpt-4o',
        temperature: 0.8,
        tool_allowlist: ['segment', 'draft_copy', 'summarize', 'handoff', 'create_campaign'],
        memory_namespace: 'mkt',
        metadata: {
          ...base.metadata,
          avatar: '📣',
          color: '#ec4899',
          capabilities: ['campaign_management', 'content_creation', 'audience_segmentation', 'analytics'],
        },
      };

    case AgentRoles.CUSTOMER_SERVICE_MANAGER:
      return {
        ...base,
        display_name: 'Customer Service Manager',
        model: process.env.AISHA_CS_MODEL || base.model,
        temperature: 0.2,
        tool_allowlist: ['crm_query', 'kb_search', 'draft_reply', 'summarize', 'handoff', 'create_ticket'],
        memory_namespace: 'cs',
        metadata: {
          ...base.metadata,
          avatar: '🎧',
          color: '#06b6d4',
          capabilities: ['issue_resolution', 'knowledge_base', 'customer_communication', 'escalation'],
        },
      };

    default:
      return base;
  }
}

/**
 * Get agent profile with optional tenant override
 * @param {Object} options
 * @param {string} options.tenant_id - Tenant ID
 * @param {string} options.role - Agent role
 * @returns {Promise<Object>} Agent profile
 */
export async function getAgentProfile({ tenant_id, role }) {
  // TODO: Fetch tenant-specific overrides from database
  // For now, return default with tenant-scoped ID
  const profile = getDefaultAgentProfile(role, tenant_id);
  
  // Validate the profile
  const { valid, errors } = validateAgent(profile);
  if (!valid) {
    console.warn(`[AgentRegistry] Invalid agent profile for ${role}:`, errors);
  }
  
  return profile;
}

/**
 * Get all agent profiles for a tenant
 * @param {string} tenant_id - Tenant ID
 * @returns {Promise<Object[]>} Array of agent profiles
 */
export async function getAllAgentProfiles(tenant_id = null) {
  return Promise.all(ROLES.map(role => getAgentProfile({ tenant_id, role })));
}

/**
 * Check if agent can use a specific tool
 * @param {Object} agent - Agent profile
 * @param {string} tool_name - Tool name
 * @returns {boolean}
 */
export function canUseTool(agent, tool_name) {
  return agent.tool_allowlist.includes(tool_name) || agent.tool_allowlist.includes('*');
}

/**
 * Get escalation target for an agent given a trigger
 * @param {Object} agent - Agent profile
 * @param {string} trigger - Escalation trigger
 * @returns {{ target_role: string | null, rule: Object } | null}
 */
export function getEscalationTarget(agent, trigger) {
  const rules = agent.escalation_rules
    .filter(r => r.trigger === trigger)
    .sort((a, b) => (a.priority || 100) - (b.priority || 100));
  
  if (rules.length === 0) return null;
  
  const rule = rules[0];
  return { target_role: rule.target_role, rule };
}
