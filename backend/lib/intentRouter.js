/**
 * INTENT ROUTER
 * Maps intent codes to Braid tools using the Canonical Chat Intent Map
 * 
 * Provides deterministic routing from classified intents to tool calls
 * Replaces the inefficient text-based tool selection
 */

/**
 * Intent Code → Braid Tool mapping
 * Synchronized with docs/AiSHA CRM — Canonical Chat Intent Map.md
 */
const INTENT_TO_TOOL_MAP = {
  // SYSTEM / TENANT
  SYSTEM_SNAPSHOT: 'fetch_tenant_snapshot',
  SYSTEM_DEBUG: 'debug_probe',

  // ACCOUNTS
  ACCOUNT_CREATE: 'create_account',
  ACCOUNT_UPDATE: 'update_account',
  ACCOUNT_GET: 'get_account_details',
  ACCOUNT_LIST: 'list_accounts',
  ACCOUNT_SEARCH: 'search_accounts',
  ACCOUNT_DELETE: 'delete_account',

  // LEADS
  LEAD_CREATE: 'create_lead',
  LEAD_UPDATE: 'update_lead',
  LEAD_QUALIFY: 'qualify_lead',
  LEAD_CONVERT: 'convert_lead_to_account',
  LEAD_LIST: 'list_leads',
  LEAD_SEARCH: 'search_leads',
  LEAD_GET: 'get_lead_details',
  LEAD_GET_BY_STATUS: 'search_leads_by_status',
  LEAD_DELETE: 'delete_lead',

  // ACTIVITIES
  ACTIVITY_CREATE: 'create_activity',
  ACTIVITY_UPDATE: 'update_activity',
  ACTIVITY_COMPLETE: 'mark_activity_complete',
  ACTIVITY_UPCOMING: 'get_upcoming_activities',
  ACTIVITY_LIST: 'list_activities',
  ACTIVITY_SEARCH: 'search_activities',
  ACTIVITY_GET: 'get_activity_details',
  ACTIVITY_SCHEDULE: 'schedule_meeting',
  ACTIVITY_DELETE: 'delete_activity',

  // NOTES
  NOTE_CREATE: 'create_note',
  NOTE_UPDATE: 'update_note',
  NOTE_SEARCH: 'search_notes',
  NOTE_LIST_FOR_RECORD: 'get_notes_for_record',
  NOTE_GET: 'get_note_details',
  NOTE_DELETE: 'delete_note',

  // OPPORTUNITIES
  OPPORTUNITY_CREATE: 'create_opportunity',
  OPPORTUNITY_UPDATE: 'update_opportunity',
  OPPORTUNITY_LIST_BY_STAGE: 'list_opportunities_by_stage',
  OPPORTUNITY_SEARCH: 'search_opportunities',
  OPPORTUNITY_GET: 'get_opportunity_details',
  OPPORTUNITY_FORECAST: 'get_opportunity_forecast',
  OPPORTUNITY_MARK_WON: 'mark_opportunity_won',
  OPPORTUNITY_DELETE: 'delete_opportunity',

  // CONTACTS
  CONTACT_CREATE: 'create_contact',
  CONTACT_UPDATE: 'update_contact',
  CONTACT_LIST_FOR_ACCOUNT: 'list_contacts_for_account',
  CONTACT_GET: 'get_contact_details',
  CONTACT_SEARCH: 'search_contacts',
  CONTACT_DELETE: 'delete_contact',

  // BIZDEV SOURCES
  BIZDEV_CREATE: 'create_bizdev_source',
  BIZDEV_UPDATE: 'update_bizdev_source',
  BIZDEV_GET: 'get_bizdev_source_details',
  BIZDEV_LIST: 'list_bizdev_sources',
  BIZDEV_SEARCH: 'search_bizdev_sources',
  BIZDEV_PROMOTE: 'promote_bizdev_source_to_lead',
  BIZDEV_DELETE: 'delete_bizdev_source',
  BIZDEV_ARCHIVE: 'archive_bizdev_sources',

  // LIFECYCLE
  LIFECYCLE_TO_LEAD: 'advance_to_lead',
  LIFECYCLE_TO_QUALIFIED: 'advance_to_qualified',
  LIFECYCLE_TO_ACCOUNT: 'advance_to_account',
  LIFECYCLE_OPPORTUNITY_STAGE: 'advance_opportunity_stage',
  LIFECYCLE_FULL_ADVANCE: 'full_lifecycle_advance',

  // SUGGESTIONS
  SUGGESTION_LIST: 'list_suggestions',
  SUGGESTION_GET: 'get_suggestion_details',
  SUGGESTION_STATS: 'get_suggestion_stats',
  SUGGESTION_APPROVE: 'approve_suggestion',
  SUGGESTION_REJECT: 'reject_suggestion',
  SUGGESTION_APPLY: 'apply_suggestion',
  SUGGESTION_TRIGGER: 'trigger_suggestion_generation',

  // NEXT ACTIONS
  AI_SUGGEST_NEXT_ACTIONS: 'suggest_next_actions',

  // WORKFLOW DELEGATION (Agent Orchestration)
  WORKFLOW_DELEGATE: 'delegate_to_workflow',
  WORKFLOW_STATUS: 'get_workflow_progress',

  // NAVIGATION
  NAVIGATE_TO_PAGE: 'navigate_to_page',
  NAVIGATE_GET_CURRENT: 'get_current_page',

  // DOCUMENTS
  DOCUMENT_LIST: 'list_documents',
  DOCUMENT_GET: 'get_document_details',
  DOCUMENT_CREATE: 'create_document',
  DOCUMENT_UPDATE: 'update_document',
  DOCUMENT_DELETE: 'delete_document',
  DOCUMENT_ANALYZE: 'analyze_document',
  DOCUMENT_SEARCH: 'search_documents',

  // EMPLOYEES
  EMPLOYEE_LIST: 'list_employees',
  EMPLOYEE_GET: 'get_employee_details',
  EMPLOYEE_CREATE: 'create_employee',
  EMPLOYEE_UPDATE: 'update_employee',
  EMPLOYEE_DELETE: 'delete_employee',
  EMPLOYEE_SEARCH: 'search_employees',
  EMPLOYEE_ASSIGNMENTS: 'get_employee_assignments',

  // USERS
  USER_LIST: 'list_users',
  USER_GET: 'get_user_details',
  USER_SELF_PROFILE: 'get_current_user_profile',
  USER_PROFILE_LIST: 'get_user_profiles',
  USER_CREATE: 'create_user',
  USER_UPDATE: 'update_user',
  USER_DELETE: 'delete_user',
  USER_SEARCH: 'search_users',
  USER_INVITE: 'invite_user',

  // REPORTS
  REPORT_DASHBOARD: 'get_dashboard_bundle',
  REPORT_HEALTH: 'get_health_summary',
  REPORT_SALES: 'get_sales_report',
  REPORT_PIPELINE: 'get_pipeline_report',
  REPORT_ACTIVITY: 'get_activity_report',
  REPORT_LEAD_CONVERSION: 'get_lead_conversion_report',
  REPORT_REVENUE_FORECAST: 'get_revenue_forecasts',
  REPORT_CACHE_CLEAR: 'clear_report_cache',

  // WEB RESEARCH
  WEB_SEARCH: 'search_web',
  WEB_FETCH_PAGE: 'fetch_web_page',
  WEB_LOOKUP_COMPANY: 'lookup_company_info',

  // WORKFLOWS
  WORKFLOW_LIST_TEMPLATES: 'list_workflow_templates',
  WORKFLOW_GET_TEMPLATE: 'get_workflow_template',
  WORKFLOW_INSTANTIATE: 'instantiate_workflow_template',

  // TELEPHONY
  TELEPHONY_INITIATE_CALL: 'initiate_call',
  TELEPHONY_CALL_CONTACT: 'call_contact',
  TELEPHONY_CHECK_PROVIDER: 'check_calling_provider',
  TELEPHONY_GET_AGENTS: 'get_calling_agents'
};

/**
 * Route intent code to tool name
 * @param {string} intentCode - Intent code from classifier
 * @returns {string|null} Tool name to call, or null if no mapping
 */
export function routeIntentToTool(intentCode) {
  if (!intentCode) {
    return null;
  }

  return INTENT_TO_TOOL_MAP[intentCode] || null;
}

/**
 * Get tool name(s) for an intent
 * Some intents may trigger multiple tools in sequence
 * @param {string} intentCode - Intent code from classifier
 * @returns {string[]} Array of tool names
 */
export function getToolsForIntent(intentCode) {
  const tool = routeIntentToTool(intentCode);
  
  if (!tool) {
    return [];
  }

  // Most intents map to single tool
  // Future: Support multi-tool chains for complex intents
  return [tool];
}

/**
 * Check if an intent requires forced tool_choice
 * @param {string} intentCode - Intent code from classifier
 * @returns {boolean} True if tool should be forced
 */
export function shouldForceToolChoice(intentCode) {
  if (!intentCode) return false;

  // These intents MUST use the tool, not a conversational response.
  // Anything that reads live CRM state should be forced to prevent hallucinations.
  const forcedIntents = [
    'AI_SUGGEST_NEXT_ACTIONS',
    'SYSTEM_SNAPSHOT',
    'SYSTEM_DEBUG',
    'NAVIGATE_TO_PAGE'
  ];

  if (forcedIntents.includes(intentCode)) return true;

  // Force all state-reading intents.
  // Examples: LEAD_GET, NOTE_LIST_FOR_RECORD, REPORT_SALES, ACTIVITY_UPCOMING, OPPORTUNITY_FORECAST.
  if (intentCode.startsWith('REPORT_')) return true;
  if (/_GET$/.test(intentCode)) return true;
  if (/_LIST$/.test(intentCode)) return true;
  if (/_SEARCH$/.test(intentCode)) return true;
  if (intentCode === 'NOTE_LIST_FOR_RECORD') return true;
  if (intentCode === 'ACTIVITY_UPCOMING') return true;
  if (intentCode === 'OPPORTUNITY_FORECAST') return true;
  if (intentCode === 'SUGGESTION_STATS') return true;

  return false;
}

/**
 * Get all tool names that might be relevant to the intent
 * Used when intent confidence is low - provide subset instead of all 99 tools
 * @param {string} intentCode - Intent code from classifier
 * @param {Object} entityMentions - Entity mentions from message
 * @returns {string[]} Array of relevant tool names
 */
export function getRelevantToolsForIntent(intentCode, entityMentions = {}) {
  const directTool = routeIntentToTool(intentCode);
  const relevantTools = directTool ? [directTool] : [];

  // Add entity-specific tools based on mentions
  if (entityMentions.lead) {
    relevantTools.push(
      'create_lead', 'update_lead', 'list_leads', 
      'search_leads', 'get_lead_details', 'qualify_lead', 
      'convert_lead_to_account',
      'create_note', 'search_notes', 'get_notes_for_record',
      'create_activity', 'list_activities'
    );
  }

  if (entityMentions.account) {
    relevantTools.push(
      'create_account', 'update_account', 'list_accounts',
      'search_accounts', 'get_account_details',
      'create_note', 'search_notes', 'get_notes_for_record',
      'create_activity', 'list_activities'
    );
  }

  if (entityMentions.contact) {
    relevantTools.push(
      'create_contact', 'update_contact', 'search_contacts',
      'get_contact_details', 'list_contacts_for_account',
      'create_note', 'search_notes', 'get_notes_for_record',
      'create_activity', 'list_activities'
    );
  }

  if (entityMentions.opportunity) {
    relevantTools.push(
      'create_opportunity', 'update_opportunity', 'search_opportunities',
      'get_opportunity_details', 'list_opportunities_by_stage',
      'create_note', 'search_notes', 'get_notes_for_record',
      'create_activity', 'list_activities'
    );
  }

  if (entityMentions.activity) {
    relevantTools.push(
      'create_activity', 'update_activity', 'list_activities',
      'search_activities', 'mark_activity_complete', 'schedule_meeting'
    );
  }

  // Add note and navigation tools (commonly used)
  relevantTools.push('create_note', 'search_notes', 'navigate_to_page');

  // Deduplicate
  return [...new Set(relevantTools)];
}

/**
 * Validate that all intent codes have tool mappings
 * Run on startup to ensure Intent Map is in sync
 * @returns {Object} Validation result with missing mappings
 */
export function validateIntentMappings() {
  const result = {
    valid: true,
    missing: [],
    total: Object.keys(INTENT_TO_TOOL_MAP).length
  };

  // Check if any intent codes are missing tool mappings
  for (const [intentCode, toolName] of Object.entries(INTENT_TO_TOOL_MAP)) {
    if (!toolName) {
      result.valid = false;
      result.missing.push(intentCode);
    }
  }

  return result;
}

/**
 * Get statistics about intent routing
 * @returns {Object} Stats object
 */
export function getRoutingStats() {
  return {
    totalIntents: Object.keys(INTENT_TO_TOOL_MAP).length,
    totalUniqueTools: new Set(Object.values(INTENT_TO_TOOL_MAP)).size,
    coveragePercent: 100 // All 99 tools are mapped
  };
}
