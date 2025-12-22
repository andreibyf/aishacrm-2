/**
 * Braid MCP Bridge
 * 
 * Unified execution layer that routes MCP tool calls through Braid.
 * This ensures ALL AI actions (whether from chat or MCP) go through:
 * - Policy enforcement
 * - Audit logging  
 * - Caching
 * - Tenant isolation
 * 
 * ARCHITECTURE:
 * MCP execute-tool → braidMcpBridge → executeBraidTool() → .braid files → V2 API
 */

import { executeBraidTool, TOOL_REGISTRY, TOOL_ACCESS_TOKEN } from './braidIntegration-v2.js';

/**
 * Map MCP tool names to Braid tool names
 * MCP uses "crm.search_accounts" format, Braid uses "search_accounts"
 */
const MCP_TO_BRAID_MAP = {
  // Search tools
  'crm.search_accounts': 'search_accounts',
  'crm.search_contacts': 'search_contacts', 
  'crm.search_leads': 'search_leads',
  'crm.search_opportunities': 'search_opportunities',
  'crm.search_activities': 'search_activities',
  
  // Get details tools
  'crm.get_account_details': 'get_account_details',
  'crm.get_contact_details': 'get_contact_details',
  'crm.get_lead_details': 'get_lead_details',
  'crm.get_opportunity_details': 'get_opportunity_details',
  'crm.get_activity_details': 'get_activity_details',
  
  // List tools
  'crm.list_accounts': 'list_accounts',
  'crm.list_leads': 'list_leads',
  'crm.list_contacts_for_account': 'list_contacts_for_account',
  'crm.list_opportunities_by_stage': 'list_opportunities_by_stage',
  'crm.list_activities': 'list_activities',
  
  // Create tools
  'crm.create_account': 'create_account',
  'crm.create_lead': 'create_lead',
  'crm.create_contact': 'create_contact',
  'crm.create_opportunity': 'create_opportunity',
  'crm.create_activity': 'create_activity',
  'crm.create_note': 'create_note',
  
  // Update tools
  'crm.update_account': 'update_account',
  'crm.update_lead': 'update_lead',
  'crm.update_contact': 'update_contact',
  'crm.update_opportunity': 'update_opportunity',
  'crm.update_activity': 'update_activity',
  
  // Snapshot
  'crm.fetch_tenant_snapshot': 'fetch_tenant_snapshot',
  'crm.get_tenant_stats': 'fetch_tenant_snapshot', // Map stats to snapshot with scope=counts
  
  // BizDev workflow
  'crm.create_bizdev_source': 'create_bizdev_source',
  'crm.promote_bizdev_source_to_lead': 'promote_bizdev_source_to_lead',
  'crm.list_bizdev_sources': 'list_bizdev_sources',
  
  // Lifecycle
  'crm.advance_to_lead': 'advance_to_lead',
  'crm.advance_to_qualified': 'advance_to_qualified',
  'crm.advance_to_account': 'advance_to_account',
  'crm.full_lifecycle_advance': 'full_lifecycle_advance',
  
  // Documents
  'crm.list_documents': 'list_documents',
  'crm.get_document_details': 'get_document_details',
  'crm.create_document': 'create_document',
  'crm.update_document': 'update_document',
  'crm.delete_document': 'delete_document',
  'crm.analyze_document': 'analyze_document',
  'crm.search_documents': 'search_documents',
  
  // Employees
  'crm.list_employees': 'list_employees',
  'crm.get_employee_details': 'get_employee_details',
  'crm.create_employee': 'create_employee',
  'crm.update_employee': 'update_employee',
  'crm.delete_employee': 'delete_employee',
  'crm.search_employees': 'search_employees',
  'crm.get_employee_assignments': 'get_employee_assignments',
  
  // Users
  'crm.list_users': 'list_users',
  'crm.get_user_details': 'get_user_details',
  'crm.get_current_user_profile': 'get_current_user_profile',
  'crm.get_user_profiles': 'get_user_profiles',
  'crm.create_user': 'create_user',
  'crm.update_user': 'update_user',
  'crm.delete_user': 'delete_user',
  'crm.search_users': 'search_users',
  'crm.invite_user': 'invite_user',
  
  // Reports & Analytics
  'crm.get_dashboard_bundle': 'get_dashboard_bundle',
  'crm.get_health_summary': 'get_health_summary',
  'crm.get_sales_report': 'get_sales_report',
  'crm.get_pipeline_report': 'get_pipeline_report',
  'crm.get_activity_report': 'get_activity_report',
  'crm.get_lead_conversion_report': 'get_lead_conversion_report',
  'crm.get_revenue_forecasts': 'get_revenue_forecasts',
  'crm.clear_report_cache': 'clear_report_cache',
};

/**
 * Transform MCP parameters to Braid parameters
 * Handles differences in parameter naming conventions
 */
function transformParameters(mcpToolName, params) {
  const transformed = { ...params };
  
  // Handle get_record which needs entity-specific routing
  if (mcpToolName === 'crm.get_record') {
    const entity = (params.entity || '').toLowerCase();
    const entityMap = {
      account: 'get_account_details',
      accounts: 'get_account_details',
      contact: 'get_contact_details', 
      contacts: 'get_contact_details',
      lead: 'get_lead_details',
      leads: 'get_lead_details',
      opportunity: 'get_opportunity_details',
      opportunities: 'get_opportunity_details',
      activity: 'get_activity_details',
      activities: 'get_activity_details',
    };
    
    const braidTool = entityMap[entity];
    if (!braidTool) {
      return { error: `Unsupported entity: ${entity}` };
    }
    
    // Map id to entity-specific id parameter
    const idParamMap = {
      get_account_details: 'account_id',
      get_contact_details: 'contact_id',
      get_lead_details: 'lead_id',
      get_opportunity_details: 'opportunity_id',
      get_activity_details: 'activity_id',
    };
    
    return {
      braidTool,
      params: {
        tenant: params.tenant_id,
        [idParamMap[braidTool]]: params.id,
      }
    };
  }
  
  // Handle tenant_id → tenant mapping
  if (params.tenant_id && !params.tenant) {
    transformed.tenant = params.tenant_id;
    delete transformed.tenant_id;
  }
  
  // Handle query → q mapping for search tools
  if (params.q && !params.query) {
    transformed.query = params.q;
    delete transformed.q;
  }
  
  // Handle get_tenant_stats → fetch_tenant_snapshot with scope=counts
  if (mcpToolName === 'crm.get_tenant_stats') {
    transformed.scope = 'counts';
    transformed.limit = 0; // Just counts, no records
  }
  
  return { params: transformed };
}

/**
 * Execute an MCP tool through Braid
 * 
 * @param {string} mcpToolName - MCP-style tool name (e.g., "crm.search_accounts")
 * @param {Object} parameters - Tool parameters
 * @param {Object} tenantRecord - Tenant record with id (UUID)
 * @param {string} userId - User ID (optional)
 * @returns {Promise<{status: string, data?: any, error?: string}>}
 */
export async function executeMcpToolViaBraid(mcpToolName, parameters, tenantRecord, userId = null) {
  // Check if this MCP tool has a Braid mapping
  let braidToolName = MCP_TO_BRAID_MAP[mcpToolName];
  let transformedParams = parameters;
  
  // Handle dynamic routing (e.g., crm.get_record)
  if (mcpToolName === 'crm.get_record') {
    const result = transformParameters(mcpToolName, parameters);
    if (result.error) {
      return { status: 'error', message: result.error };
    }
    braidToolName = result.braidTool;
    transformedParams = result.params;
  } else if (braidToolName) {
    const result = transformParameters(mcpToolName, parameters);
    if (result.error) {
      return { status: 'error', message: result.error };
    }
    transformedParams = result.params;
  }
  
  // If no Braid mapping exists, return not supported
  if (!braidToolName) {
    return {
      status: 'error',
      message: `MCP tool '${mcpToolName}' does not have a Braid mapping. Use native implementation or add mapping.`,
      code: 'NO_BRAID_MAPPING'
    };
  }
  
  // Verify the Braid tool exists
  if (!TOOL_REGISTRY[braidToolName]) {
    return {
      status: 'error',
      message: `Braid tool '${braidToolName}' not found in registry`,
      code: 'TOOL_NOT_FOUND'
    };
  }
  
  console.log('[BraidMcpBridge] Routing MCP tool through Braid', {
    mcpTool: mcpToolName,
    braidTool: braidToolName,
    tenantId: tenantRecord?.id?.substring(0, 8),
  });
  
  try {
    // Execute through Braid with full policy enforcement
    const result = await executeBraidTool(
      braidToolName,
      transformedParams,
      tenantRecord,
      userId,
      TOOL_ACCESS_TOKEN
    );
    
    // Transform Braid result to MCP response format
    if (result.tag === 'Ok') {
      return {
        status: 'success',
        data: result.value
      };
    } else {
      return {
        status: 'error',
        message: result.error?.message || 'Tool execution failed',
        error: result.error
      };
    }
  } catch (error) {
    console.error('[BraidMcpBridge] Execution error:', error);
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Check if an MCP tool can be routed through Braid
 */
export function hasBraidMapping(mcpToolName) {
  return !!MCP_TO_BRAID_MAP[mcpToolName] || mcpToolName === 'crm.get_record';
}

/**
 * Get all MCP tools that have Braid mappings
 */
export function getBraidMappedTools() {
  return Object.keys(MCP_TO_BRAID_MAP);
}

/**
 * Tools that should NOT be routed through Braid (native implementations)
 * These are either:
 * - Workflow tools that have complex logic not yet in .braid files
 * - Template tools that read from system tables (not tenant-specific)
 * - External integrations (GitHub, Wikipedia, LLM)
 */
export const NATIVE_MCP_TOOLS = new Set([
  // Workflow tools - complex logic, keep native for now
  'crm.list_workflows',
  'crm.execute_workflow', 
  'crm.update_workflow',
  'crm.toggle_workflow_status',
  
  // Template tools - system-level, not tenant-specific data
  'crm.list_workflow_templates',
  'crm.get_workflow_template',
  'crm.instantiate_workflow_template',
  
  // External integrations
  'github.list_repos',
  'github.get_user',
  'web.search_wikipedia',
  'web.get_wikipedia_page',
  'llm.generate_json',
]);

/**
 * Determine how an MCP tool should be executed
 * @returns {'braid' | 'native' | 'unsupported'}
 */
export function getExecutionStrategy(mcpToolName) {
  if (NATIVE_MCP_TOOLS.has(mcpToolName)) {
    return 'native';
  }
  if (hasBraidMapping(mcpToolName)) {
    return 'braid';
  }
  return 'unsupported';
}
