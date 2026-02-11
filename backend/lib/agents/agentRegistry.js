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

          // Leads – allow AiSHA to inspect and correct lead records
          'create_lead',
          'update_lead',
          'get_lead_details',
          'search_leads',
          'search_leads_by_status',
          'list_leads',

          // Activities and notes
          'create_activity',        // Create tasks for team
          'list_activities',        // Check team calendar/tasks
          'create_note',            // Document decisions, plans

          // Delegation
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
          // Opportunities
          'create_opportunity',
          'update_opportunity',
          'get_opportunity_details',
          'search_opportunities',
          'search_opportunities_by_stage',
          'list_opportunities_by_stage',
          'advance_opportunity_stage',
          'mark_opportunity_won',
          'get_opportunity_forecast',

          // Accounts
          'create_account',
          'update_account',
          'get_account_details',
          'search_accounts',
          'search_accounts_by_status',
          'list_accounts',

          // Leads
          'get_lead_details',
          'search_leads',
          'search_leads_by_status',
          'list_leads',
          'qualify_lead',
          'convert_lead_to_account',

          // Contacts
          'get_contact_details',
          'get_contact_by_name',
          'search_contacts',
          'list_contacts_for_account',
          'list_all_contacts',

          // Activities
          'create_activity',
          'update_activity',
          'get_activity_details',
          'search_activities',
          'list_activities',
          'mark_activity_complete',
          'schedule_meeting',
          'get_upcoming_activities',

          // Reports
          'get_pipeline_report',
          'get_sales_report',
          'get_revenue_forecasts',
          'get_lead_conversion_report',
          'get_dashboard_bundle',

          // Notes
          'create_note',
          'update_note',
          'get_note_details',
          'get_notes_for_record',
          'search_notes',

          // Suggestions
          'get_suggestion_details',
          'get_suggestion_stats',
          'apply_suggestion',
          'approve_suggestion',
          'reject_suggestion',
          'suggest_next_actions',

          // Lifecycle
          'advance_to_lead',
          'advance_to_qualified',
          'advance_to_account',
          'full_lifecycle_advance',

          // Navigation
          'navigate_to_page',
          'get_current_page',

          // System
          'fetch_tenant_snapshot',
          'get_health_summary',
          'debug_probe',

          // Delegation
          'delegate_task',
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
          // Contacts
          'create_contact',
          'update_contact',
          'get_contact_details',
          'get_contact_by_name',
          'search_contacts',
          'search_contacts_by_status',
          'list_contacts_for_account',
          'list_all_contacts',

          // Accounts
          'get_account_details',
          'search_accounts',
          'list_accounts',

          // BizDev Sources
          'create_bizdev_source',
          'update_bizdev_source',
          'get_bizdev_source_details',
          'search_bizdev_sources',
          'list_bizdev_sources',
          'archive_bizdev_sources',
          'promote_bizdev_source_to_lead',

          // Research
          'search_web',
          'fetch_web_page',
          'lookup_company_info',

          // Activities
          'create_activity',
          'update_activity',
          'get_activity_details',
          'search_activities',
          'list_activities',
          'mark_activity_complete',
          'get_upcoming_activities',

          // Notes
          'create_note',
          'update_note',
          'get_note_details',
          'get_notes_for_record',
          'search_notes',

          // Documents
          'create_document',
          'get_document_details',
          'search_documents',
          'list_documents',
          'analyze_document',

          // Telephony
          'call_contact',
          'initiate_call',
          'check_calling_provider',
          'get_calling_agents',

          // Suggestions
          'suggest_next_actions',
          'get_suggestion_details',

          // Navigation
          'navigate_to_page',
          'get_current_page',

          // System
          'fetch_tenant_snapshot',
          'debug_probe',
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
          // Activities
          'create_activity',
          'update_activity',
          'get_activity_details',
          'search_activities',
          'list_activities',
          'mark_activity_complete',
          'schedule_meeting',
          'get_upcoming_activities',

          // Workflows
          'get_workflow_template',
          'list_workflow_templates',
          'instantiate_workflow_template',
          'trigger_workflow_by_name',
          'list_active_workflows',
          'get_workflow_progress',
          'get_workflow_notes',

          // Notes
          'create_note',
          'update_note',
          'get_note_details',
          'get_notes_for_record',
          'search_notes',

          // Accounts
          'get_account_details',
          'search_accounts',
          'list_accounts',

          // Contacts
          'get_contact_details',
          'get_contact_by_name',
          'search_contacts',
          'list_contacts_for_account',

          // Opportunities
          'get_opportunity_details',
          'search_opportunities',
          'list_opportunities_by_stage',

          // Reports
          'get_activity_report',
          'get_dashboard_bundle',

          // Navigation
          'navigate_to_page',
          'get_current_page',

          // System
          'fetch_tenant_snapshot',
          'get_health_summary',
          'debug_probe',

          // Delegation
          'delegate_task',
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
          // Leads
          'create_lead',
          'update_lead',
          'get_lead_details',
          'search_leads',
          'search_leads_by_status',
          'list_leads',

          // BizDev Sources
          'create_bizdev_source',
          'update_bizdev_source',
          'get_bizdev_source_details',
          'search_bizdev_sources',
          'list_bizdev_sources',
          'promote_bizdev_source_to_lead',

          // Contacts
          'create_contact',
          'update_contact',
          'get_contact_details',
          'search_contacts',
          'list_all_contacts',

          // Activities
          'create_activity',
          'update_activity',
          'get_activity_details',
          'search_activities',
          'list_activities',
          'mark_activity_complete',

          // Research
          'search_web',
          'fetch_web_page',
          'lookup_company_info',

          // Notes
          'create_note',
          'update_note',
          'get_note_details',
          'get_notes_for_record',
          'search_notes',

          // Documents
          'create_document',
          'get_document_details',
          'search_documents',
          'list_documents',

          // Reports
          'get_lead_conversion_report',
          'get_dashboard_bundle',

          // Suggestions
          'trigger_suggestion_generation',
          'list_suggestions',
          'get_suggestion_details',

          // Navigation
          'navigate_to_page',
          'get_current_page',

          // System
          'fetch_tenant_snapshot',
          'debug_probe',
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
          // Contacts
          'get_contact_details',
          'get_contact_by_name',
          'search_contacts',
          'update_contact',
          'list_contacts_for_account',

          // Accounts
          'get_account_details',
          'search_accounts',
          'list_accounts',
          'update_account',

          // Activities
          'create_activity',
          'update_activity',
          'get_activity_details',
          'search_activities',
          'list_activities',
          'mark_activity_complete',
          'get_upcoming_activities',

          // Notes
          'create_note',
          'update_note',
          'get_note_details',
          'get_notes_for_record',
          'search_notes',

          // Documents
          'get_document_details',
          'search_documents',
          'list_documents',

          // Telephony
          'call_contact',
          'initiate_call',
          'check_calling_provider',

          // Suggestions
          'suggest_next_actions',
          'get_suggestion_details',

          // Navigation
          'navigate_to_page',
          'get_current_page',

          // System
          'fetch_tenant_snapshot',
          'debug_probe',
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
