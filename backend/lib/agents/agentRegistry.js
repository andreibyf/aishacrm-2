/**
 * Agent Registry
 *
 * Stores per-role agent configuration with formal identity schema.
 * Imports canonical contract from shared/contracts.
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
} from '../../../shared/contracts/agents.js';

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
        // BRAID TOOLS ONLY - orchestration and oversight focused
        tool_allowlist: [
          'fetch_tenant_snapshot',  // Get overview of all CRM data
          'create_activity',        // Create tasks for team
          'list_activities',        // Check team calendar/tasks
          'create_note',            // Document decisions, plans
          'delegate_task',          // Delegate to specialists
        ],
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
        // BRAID TOOLS ONLY - sales pipeline and opportunity management
        tool_allowlist: [
          'create_opportunity',          // Create new deals
          'list_opportunities_by_stage', // Pipeline visibility
          'update_opportunity',          // Move deals through stages
          'mark_opportunity_won',        // Close deals
          'get_opportunity_forecast',    // Revenue forecasting
          'create_activity',             // Schedule sales calls
          'create_note',                 // Log sales notes
          'delegate_task',               // Delegate to marketing/client services
        ],
        memory_namespace: 'sales',
        metadata: {
          ...base.metadata,
          avatar: '💼',
          color: '#10b981',
          capabilities: ['deal_management', 'pipeline_analysis', 'forecasting', 'negotiation'],
        },
      };

    case AgentRoles.CLIENT_SERVICES_EXPERT:
      return {
        ...base,
        display_name: 'Client Services Expert',
        model: process.env.AISHA_CS_EXPERT_MODEL || base.model,
        temperature: 0.5,
        // BRAID TOOLS ONLY - lead/contact research and creation
        tool_allowlist: [
          'search_web',          // Research companies/prospects
          'lookup_company_info', // Get company details
          'create_lead',         // Create new leads
          'create_contact',      // Create new contacts
          'create_note',         // Document research findings
        ],
        memory_namespace: 'client_services',
        metadata: {
          ...base.metadata,
          avatar: '🤝',
          color: '#f0883e',
          capabilities: ['client_relations', 'research', 'data_enrichment', 'contact_discovery'],
        },
      };

    case AgentRoles.PROJECT_MANAGER:
      return {
        ...base,
        display_name: 'Project Manager',
        model: process.env.AISHA_PM_MODEL || 'gpt-4o',
        temperature: 0.25,
        // BRAID TOOLS ONLY - verified against backend/lib/braidIntegration-v2.js TOOL_REGISTRY
        tool_allowlist: [
          'create_activity',        // Schedule meetings, tasks, calls
          'update_activity',        // Reschedule or modify activities
          'mark_activity_complete', // Mark tasks/meetings as done
          'list_activities',        // Check calendar/schedule
          'create_note',            // Document project notes, plans
          'update_note',            // Edit existing notes
          'get_notes_for_record',   // Read project documentation
          'delegate_task',          // Delegate to client services/marketing
        ],
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
        // BRAID TOOLS ONLY - campaign and content management
        tool_allowlist: [
          'search_leads',           // Segment/target leads
          'list_accounts',          // Segment/target accounts
          'create_note',            // Draft campaign notes/plans
          'create_activity',        // Schedule campaign tasks
        ],
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
        // BRAID TOOLS ONLY - customer support and issue management
        tool_allowlist: [
          'search_contacts',        // Find customer info
          'get_contact_details',    // Get customer details
          'create_note',            // Log support interactions
          'create_activity',        // Schedule follow-ups
          'search_notes',           // Search support history
        ],
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
