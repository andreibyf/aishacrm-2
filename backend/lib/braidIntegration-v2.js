/**
 * Braid AI Integration Module - Executive Assistant Edition
 * Comprehensive tool suite for AI-SHA CRM Executive Assistant
 */

import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { executeBraid, loadToolSchema, createBackendDeps, CRM_POLICIES, filterSensitiveFields, createAuditEntry, logToolExecution } from '../../braid-llm-kit/sdk/index.js';
import cacheManager from './cacheManager.js';

// ============================================================================
// REAL-TIME METRICS TRACKING (Redis-backed)
// ============================================================================

/**
 * Increment real-time metrics counters (fire-and-forget)
 * @param {string} tenantId - Tenant UUID
 * @param {string} toolName - Tool name
 * @param {boolean} success - Whether the call succeeded
 * @param {boolean} cacheHit - Whether it was a cache hit
 * @param {number} latencyMs - Execution time in ms
 */
function trackRealtimeMetrics(tenantId, toolName, success, cacheHit, latencyMs) {
  setImmediate(async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const minute = Math.floor(now / 60) * 60; // Round to minute
      const hour = Math.floor(now / 3600) * 3600; // Round to hour
      
      // Keys with 5-minute and 2-hour TTLs respectively
      const minuteKey = `braid:metrics:${tenantId}:min:${minute}`;
      const hourKey = `braid:metrics:${tenantId}:hour:${hour}`;
      const toolKey = `braid:metrics:${tenantId}:tool:${toolName}:${hour}`;
      
      // Increment counters
      await Promise.all([
        // Per-minute counters (5 min TTL)
        cacheManager.increment(`${minuteKey}:calls`, 300),
        success ? null : cacheManager.increment(`${minuteKey}:errors`, 300),
        cacheHit ? cacheManager.increment(`${minuteKey}:cache_hits`, 300) : null,
        
        // Per-hour counters (2 hour TTL)
        cacheManager.increment(`${hourKey}:calls`, 7200),
        success ? null : cacheManager.increment(`${hourKey}:errors`, 7200),
        cacheHit ? cacheManager.increment(`${hourKey}:cache_hits`, 7200) : null,
        
        // Per-tool per-hour counters (2 hour TTL)
        cacheManager.increment(`${toolKey}:calls`, 7200),
        success ? null : cacheManager.increment(`${toolKey}:errors`, 7200),
        
        // Latency tracking (store as list, 2 hour TTL)
        latencyMs ? cacheManager.set(`${hourKey}:latency:${now}`, latencyMs, 7200) : null
      ].filter(Boolean));
    } catch (err) {
      // Never block on metrics failures
      console.warn('[Braid Metrics] Failed to track:', err.message);
    }
  });
}

/**
 * Get real-time metrics from Redis
 * @param {string} tenantId - Tenant UUID
 * @param {string} window - 'minute' or 'hour'
 * @returns {Promise<Object>} Real-time metrics
 */
export async function getRealtimeMetrics(tenantId, window = 'minute') {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    if (window === 'minute') {
      const minute = Math.floor(now / 60) * 60;
      const key = `braid:metrics:${tenantId}:min:${minute}`;
      
      const [calls, errors, cacheHits] = await Promise.all([
        cacheManager.get(`${key}:calls`) || 0,
        cacheManager.get(`${key}:errors`) || 0,
        cacheManager.get(`${key}:cache_hits`) || 0
      ]);
      
      return {
        window: 'minute',
        timestamp: new Date(minute * 1000).toISOString(),
        calls: parseInt(calls) || 0,
        errors: parseInt(errors) || 0,
        cacheHits: parseInt(cacheHits) || 0,
        successRate: calls > 0 ? Math.round(((calls - errors) / calls) * 100) : 100,
        cacheHitRate: calls > 0 ? Math.round((cacheHits / calls) * 100) : 0
      };
    } else {
      const hour = Math.floor(now / 3600) * 3600;
      const key = `braid:metrics:${tenantId}:hour:${hour}`;
      
      const [calls, errors, cacheHits] = await Promise.all([
        cacheManager.get(`${key}:calls`) || 0,
        cacheManager.get(`${key}:errors`) || 0,
        cacheManager.get(`${key}:cache_hits`) || 0
      ]);
      
      return {
        window: 'hour',
        timestamp: new Date(hour * 1000).toISOString(),
        calls: parseInt(calls) || 0,
        errors: parseInt(errors) || 0,
        cacheHits: parseInt(cacheHits) || 0,
        successRate: calls > 0 ? Math.round(((calls - errors) / calls) * 100) : 100,
        cacheHitRate: calls > 0 ? Math.round((cacheHits / calls) * 100) : 0
      };
    }
  } catch (err) {
    return { error: err.message, window, calls: 0, errors: 0, cacheHits: 0 };
  }
}

/**
 * Log a Braid tool execution to the audit log (fire-and-forget)
 * @param {Object} params - Audit log parameters
 */
function logAuditEntry({
  toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
  normalizedArgs, result, executionTimeMs, cacheHit, supabase
}) {
  // Fire and forget - don't block the response
  setImmediate(async () => {
    try {
      const entityType = extractEntityType(toolName);
      const entityId = normalizedArgs?.account_id || normalizedArgs?.lead_id || 
                       normalizedArgs?.contact_id || normalizedArgs?.activity_id ||
                       normalizedArgs?.opportunity_id || normalizedArgs?.document_id ||
                       normalizedArgs?.employee_id || normalizedArgs?.user_id || null;
      
      const entry = createAuditEntry({
        toolName: toolName || 'unknown',
        braidFunction: config?.function || null,
        braidFile: config?.file || null,
        policy: config?.policy || 'UNKNOWN',
        toolClass: basePolicy?.tool_class || null,
        tenantId: tenantUuid || null,
        userId: userId || null,
        userEmail: userEmail || null,
        userRole: userRole || null,
        inputArgs: normalizedArgs || {},
        resultTag: result?.tag || null,
        resultValue: result?.tag === 'Err' ? null : (result?.value ? { summary: 'Result logged' } : null), // Don't log full result for privacy
        errorType: result?.error?.type || null,
        errorMessage: result?.error?.message?.substring?.(0, 500) || null,
        executionTimeMs: executionTimeMs || 0,
        cacheHit: cacheHit || false,
        entityType: entityType || null,
        entityId: entityId || null
      });
      
      await logToolExecution(supabase, entry);
    } catch (auditErr) {
      // Never let audit logging fail the main operation
      console.warn('[Braid Audit] Failed to log:', auditErr.message);
    }
  });
}

/**
 * Extract entity type from tool name for field-level permission filtering
 * @param {string} toolName - Name of the tool (e.g., 'get_employee_details')
 * @returns {string|null} Entity type (e.g., 'employees') or null if not recognized
 */
function extractEntityType(toolName) {
  const entityPatterns = [
    { pattern: /employee/, entity: 'employees' },
    { pattern: /user/, entity: 'users' },
    { pattern: /account/, entity: 'accounts' },
    { pattern: /contact/, entity: 'contacts' },
    { pattern: /lead/, entity: 'leads' },
    { pattern: /opportunity/, entity: 'opportunities' },
    { pattern: /activity/, entity: 'activities' },
    { pattern: /document/, entity: 'documents' },
    { pattern: /bizdev/, entity: 'bizdev_sources' },
    { pattern: /note/, entity: 'notes' },
  ];
  
  for (const { pattern, entity } of entityPatterns) {
    if (pattern.test(toolName)) {
      return entity;
    }
  }
  return null;
}

// Cache TTLs for different tool types (in seconds)
const TOOL_CACHE_TTL = {
  fetch_tenant_snapshot: 60,    // 1 minute - high-value, frequently accessed
  list_leads: 120,              // 2 minutes - list operations
  list_accounts: 120,
  list_opportunities_by_stage: 120,
  list_activities: 120,
  list_contacts_for_account: 120,
  list_bizdev_sources: 120,
  get_upcoming_activities: 60,  // 1 minute - time-sensitive
  search_leads: 60,             // 1 minute - search results
  search_accounts: 60,
  search_contacts: 60,
  search_opportunities: 60,
  search_activities: 60,
  search_documents: 60,
  search_employees: 60,
  search_users: 60,
  get_lead_details: 180,        // 3 minutes - detail views
  get_account_details: 180,
  get_contact_details: 180,
  get_activity_details: 180,
  get_opportunity_details: 180,
  get_document_details: 180,
  get_employee_details: 180,
  get_user_details: 180,
  get_opportunity_forecast: 300, // 5 minutes - aggregations
  get_dashboard_bundle: 300,
  get_health_summary: 300,
  get_sales_report: 300,
  get_pipeline_report: 300,
  get_activity_report: 300,
  get_lead_conversion_report: 300,
  get_revenue_forecasts: 300,
  get_employee_assignments: 180,
  get_current_page: 10,         // 10 seconds - navigation context
  list_documents: 120,
  list_employees: 120,
  list_users: 120,
  get_current_user_profile: 300,
  get_user_profiles: 300,
  DEFAULT: 90                   // 1.5 minutes default
};

/**
 * Generate a cache key for a Braid tool execution
 * @param {string} toolName - Name of the tool
 * @param {string} tenantId - Tenant UUID
 * @param {Object} args - Tool arguments (normalized)
 * @returns {string} Cache key
 */
function generateBraidCacheKey(toolName, tenantId, args) {
  // Create a hash of the args to keep key length manageable
  const argsHash = crypto
    .createHash('md5')
    .update(JSON.stringify(args))
    .digest('hex')
    .substring(0, 12);

  return `braid:${tenantId}:${toolName}:${argsHash}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, '..', '..', 'braid-llm-kit', 'examples', 'assistant');

/**
 * Tool Registry - Maps tool names to Braid files
 */
export const TOOL_REGISTRY = {
  // Data Snapshot
  fetch_tenant_snapshot: { file: 'snapshot.braid', function: 'fetchSnapshot', policy: 'READ_ONLY' },
  debug_probe: { file: 'snapshot.braid', function: 'probe', policy: 'READ_ONLY' },
  
  // Account Management
  create_account: { file: 'accounts.braid', function: 'createAccount', policy: 'WRITE_OPERATIONS' },
  update_account: { file: 'accounts.braid', function: 'updateAccount', policy: 'WRITE_OPERATIONS' },
  get_account_details: { file: 'accounts.braid', function: 'getAccountDetails', policy: 'READ_ONLY' },
  list_accounts: { file: 'accounts.braid', function: 'listAccounts', policy: 'READ_ONLY' },
  search_accounts: { file: 'accounts.braid', function: 'searchAccounts', policy: 'READ_ONLY' },
  delete_account: { file: 'accounts.braid', function: 'deleteAccount', policy: 'DELETE_OPERATIONS' },
  
  // Lead Management
  create_lead: { file: 'leads.braid', function: 'createLead', policy: 'WRITE_OPERATIONS' },
  update_lead: { file: 'leads.braid', function: 'updateLead', policy: 'WRITE_OPERATIONS' },
  qualify_lead: { file: 'leads.braid', function: 'qualifyLead', policy: 'WRITE_OPERATIONS' },
  convert_lead_to_account: { file: 'leads.braid', function: 'convertLeadToAccount', policy: 'WRITE_OPERATIONS' },
  list_leads: { file: 'leads.braid', function: 'listLeads', policy: 'READ_ONLY' },
  search_leads: { file: 'leads.braid', function: 'searchLeads', policy: 'READ_ONLY' },
  get_lead_details: { file: 'leads.braid', function: 'getLeadDetails', policy: 'READ_ONLY' },
  delete_lead: { file: 'leads.braid', function: 'deleteLead', policy: 'DELETE_OPERATIONS' },
  
  // Activity & Calendar
  create_activity: { file: 'activities.braid', function: 'createActivity', policy: 'WRITE_OPERATIONS' },
  update_activity: { file: 'activities.braid', function: 'updateActivity', policy: 'WRITE_OPERATIONS' },
  mark_activity_complete: { file: 'activities.braid', function: 'markActivityComplete', policy: 'WRITE_OPERATIONS' },
  get_upcoming_activities: { file: 'activities.braid', function: 'getUpcomingActivities', policy: 'READ_ONLY' },
  list_activities: { file: 'activities.braid', function: 'listActivities', policy: 'READ_ONLY' },
  search_activities: { file: 'activities.braid', function: 'searchActivities', policy: 'READ_ONLY' },
  get_activity_details: { file: 'activities.braid', function: 'getActivityDetails', policy: 'READ_ONLY' },
  schedule_meeting: { file: 'activities.braid', function: 'scheduleMeeting', policy: 'WRITE_OPERATIONS' },
  delete_activity: { file: 'activities.braid', function: 'deleteActivity', policy: 'DELETE_OPERATIONS' },
  
  // Notes
  create_note: { file: 'notes.braid', function: 'createNote', policy: 'WRITE_OPERATIONS' },
  update_note: { file: 'notes.braid', function: 'updateNote', policy: 'WRITE_OPERATIONS' },
  search_notes: { file: 'notes.braid', function: 'searchNotes', policy: 'READ_ONLY' },
  get_notes_for_record: { file: 'notes.braid', function: 'getNotesForRecord', policy: 'READ_ONLY' },
  get_note_details: { file: 'notes.braid', function: 'getNoteDetails', policy: 'READ_ONLY' },
  delete_note: { file: 'notes.braid', function: 'deleteNote', policy: 'DELETE_OPERATIONS' },
  
  // Opportunities
  create_opportunity: { file: 'opportunities.braid', function: 'createOpportunity', policy: 'WRITE_OPERATIONS' },
  update_opportunity: { file: 'opportunities.braid', function: 'updateOpportunity', policy: 'WRITE_OPERATIONS' },
  list_opportunities_by_stage: { file: 'opportunities.braid', function: 'listOpportunitiesByStage', policy: 'READ_ONLY' },
  search_opportunities: { file: 'opportunities.braid', function: 'searchOpportunities', policy: 'READ_ONLY' },
  get_opportunity_details: { file: 'opportunities.braid', function: 'getOpportunityDetails', policy: 'READ_ONLY' },
  get_opportunity_forecast: { file: 'opportunities.braid', function: 'getOpportunityForecast', policy: 'READ_ONLY' },
  mark_opportunity_won: { file: 'opportunities.braid', function: 'markOpportunityWon', policy: 'WRITE_OPERATIONS' },
  delete_opportunity: { file: 'opportunities.braid', function: 'deleteOpportunity', policy: 'DELETE_OPERATIONS' },
  
  // Contacts
  create_contact: { file: 'contacts.braid', function: 'createContact', policy: 'WRITE_OPERATIONS' },
  update_contact: { file: 'contacts.braid', function: 'updateContact', policy: 'WRITE_OPERATIONS' },
  list_contacts_for_account: { file: 'contacts.braid', function: 'listContactsForAccount', policy: 'READ_ONLY' },
  get_contact_details: { file: 'contacts.braid', function: 'getContactDetails', policy: 'READ_ONLY' },
  search_contacts: { file: 'contacts.braid', function: 'searchContacts', policy: 'READ_ONLY' },
  delete_contact: { file: 'contacts.braid', function: 'deleteContact', policy: 'DELETE_OPERATIONS' },
  
  // Web Research
  search_web: { file: 'web-research.braid', function: 'searchWeb', policy: 'READ_ONLY' },
  fetch_web_page: { file: 'web-research.braid', function: 'fetchWebPage', policy: 'READ_ONLY' },
  lookup_company_info: { file: 'web-research.braid', function: 'lookupCompanyInfo', policy: 'READ_ONLY' },

  // Workflow Templates
  list_workflow_templates: { file: 'workflows.braid', function: 'listWorkflowTemplates', policy: 'READ_ONLY' },
  get_workflow_template: { file: 'workflows.braid', function: 'getWorkflowTemplate', policy: 'READ_ONLY' },
  instantiate_workflow_template: { file: 'workflows.braid', function: 'instantiateWorkflowTemplate', policy: 'WRITE_OPERATIONS' },

  // Telephony & AI Calling
  initiate_call: { file: 'telephony.braid', function: 'initiateCall', policy: 'WRITE_OPERATIONS' },
  call_contact: { file: 'telephony.braid', function: 'callContact', policy: 'WRITE_OPERATIONS' },
  check_calling_provider: { file: 'telephony.braid', function: 'checkCallingProvider', policy: 'READ_ONLY' },
  get_calling_agents: { file: 'telephony.braid', function: 'getCallingAgents', policy: 'READ_ONLY' },

  // BizDev Sources (v3.0.0 workflow)
  create_bizdev_source: { file: 'bizdev-sources.braid', function: 'createBizDevSource', policy: 'WRITE_OPERATIONS' },
  update_bizdev_source: { file: 'bizdev-sources.braid', function: 'updateBizDevSource', policy: 'WRITE_OPERATIONS' },
  get_bizdev_source_details: { file: 'bizdev-sources.braid', function: 'getBizDevSourceDetails', policy: 'READ_ONLY' },
  list_bizdev_sources: { file: 'bizdev-sources.braid', function: 'listBizDevSources', policy: 'READ_ONLY' },
  search_bizdev_sources: { file: 'bizdev-sources.braid', function: 'searchBizDevSources', policy: 'READ_ONLY' },
  promote_bizdev_source_to_lead: { file: 'bizdev-sources.braid', function: 'promoteBizDevSourceToLead', policy: 'WRITE_OPERATIONS' },
  delete_bizdev_source: { file: 'bizdev-sources.braid', function: 'deleteBizDevSource', policy: 'DELETE_OPERATIONS' },
  archive_bizdev_sources: { file: 'bizdev-sources.braid', function: 'archiveBizDevSources', policy: 'WRITE_OPERATIONS' },

  // v3.0.0 Lifecycle Orchestration (complete workflow tools)
  advance_to_lead: { file: 'lifecycle.braid', function: 'advanceToLead', policy: 'WRITE_OPERATIONS' },
  advance_to_qualified: { file: 'lifecycle.braid', function: 'advanceToQualified', policy: 'WRITE_OPERATIONS' },
  advance_to_account: { file: 'lifecycle.braid', function: 'advanceToAccount', policy: 'WRITE_OPERATIONS' },
  advance_opportunity_stage: { file: 'lifecycle.braid', function: 'advanceOpportunityStage', policy: 'WRITE_OPERATIONS' },
  full_lifecycle_advance: { file: 'lifecycle.braid', function: 'fullLifecycleAdvance', policy: 'WRITE_OPERATIONS' },

  // AI Suggestions (Phase 3 Autonomous Operations)
  list_suggestions: { file: 'suggestions.braid', function: 'listSuggestions', policy: 'READ_ONLY' },
  get_suggestion_details: { file: 'suggestions.braid', function: 'getSuggestionDetails', policy: 'READ_ONLY' },
  get_suggestion_stats: { file: 'suggestions.braid', function: 'getSuggestionStats', policy: 'READ_ONLY' },
  approve_suggestion: { file: 'suggestions.braid', function: 'approveSuggestion', policy: 'WRITE_OPERATIONS' },
  reject_suggestion: { file: 'suggestions.braid', function: 'rejectSuggestion', policy: 'WRITE_OPERATIONS' },
  apply_suggestion: { file: 'suggestions.braid', function: 'applySuggestion', policy: 'WRITE_OPERATIONS' },
  trigger_suggestion_generation: { file: 'suggestions.braid', function: 'triggerSuggestionGeneration', policy: 'WRITE_OPERATIONS' },
  suggest_next_actions: { file: 'suggest-next-actions.braid', function: 'suggestNextActions', policy: 'READ_ONLY' },

  // CRM Navigation (v3.0.0 - allows AI to navigate user to pages)
  navigate_to_page: { file: 'navigation.braid', function: 'navigateTo', policy: 'READ_ONLY' },
  get_current_page: { file: 'navigation.braid', function: 'getCurrentPage', policy: 'READ_ONLY' },

  // Documents Management
  list_documents: { file: 'documents.braid', function: 'listDocuments', policy: 'READ_ONLY' },
  get_document_details: { file: 'documents.braid', function: 'getDocumentDetails', policy: 'READ_ONLY' },
  create_document: { file: 'documents.braid', function: 'createDocument', policy: 'WRITE_OPERATIONS' },
  update_document: { file: 'documents.braid', function: 'updateDocument', policy: 'WRITE_OPERATIONS' },
  delete_document: { file: 'documents.braid', function: 'deleteDocument', policy: 'DELETE_OPERATIONS' },
  analyze_document: { file: 'documents.braid', function: 'analyzeDocument', policy: 'READ_ONLY' },
  search_documents: { file: 'documents.braid', function: 'searchDocuments', policy: 'READ_ONLY' },

  // Employees Management
  list_employees: { file: 'employees.braid', function: 'listEmployees', policy: 'READ_ONLY' },
  get_employee_details: { file: 'employees.braid', function: 'getEmployeeDetails', policy: 'READ_ONLY' },
  create_employee: { file: 'employees.braid', function: 'createEmployee', policy: 'WRITE_OPERATIONS' },
  update_employee: { file: 'employees.braid', function: 'updateEmployee', policy: 'WRITE_OPERATIONS' },
  delete_employee: { file: 'employees.braid', function: 'deleteEmployee', policy: 'DELETE_OPERATIONS' },
  search_employees: { file: 'employees.braid', function: 'searchEmployees', policy: 'READ_ONLY' },
  get_employee_assignments: { file: 'employees.braid', function: 'getEmployeeAssignments', policy: 'READ_ONLY' },

  // Users Management (Admin operations)
  list_users: { file: 'users.braid', function: 'listUsers', policy: 'READ_ONLY' },
  get_user_details: { file: 'users.braid', function: 'getUserDetails', policy: 'READ_ONLY' },
  get_current_user_profile: { file: 'users.braid', function: 'getCurrentUserProfile', policy: 'READ_ONLY' },
  get_user_profiles: { file: 'users.braid', function: 'getUserProfiles', policy: 'READ_ONLY' },
  create_user: { file: 'users.braid', function: 'createUser', policy: 'ADMIN_ONLY' },
  update_user: { file: 'users.braid', function: 'updateUser', policy: 'ADMIN_ONLY' },
  delete_user: { file: 'users.braid', function: 'deleteUser', policy: 'ADMIN_ALL' },
  search_users: { file: 'users.braid', function: 'searchUsers', policy: 'READ_ONLY' },
  invite_user: { file: 'users.braid', function: 'inviteUser', policy: 'ADMIN_ONLY' },

  // Reports & Analytics
  get_dashboard_bundle: { file: 'reports.braid', function: 'getDashboardBundle', policy: 'READ_ONLY' },
  get_health_summary: { file: 'reports.braid', function: 'getHealthSummary', policy: 'READ_ONLY' },
  get_sales_report: { file: 'reports.braid', function: 'getSalesReport', policy: 'READ_ONLY' },
  get_pipeline_report: { file: 'reports.braid', function: 'getPipelineReport', policy: 'READ_ONLY' },
  get_activity_report: { file: 'reports.braid', function: 'getActivityReport', policy: 'READ_ONLY' },
  get_lead_conversion_report: { file: 'reports.braid', function: 'getLeadConversionReport', policy: 'READ_ONLY' },
  get_revenue_forecasts: { file: 'reports.braid', function: 'getRevenueForecasts', policy: 'READ_ONLY' },
  clear_report_cache: { file: 'reports.braid', function: 'clearReportCache', policy: 'ADMIN_ONLY' }
};

/**
 * Human-readable descriptions for each tool
 * These are exposed to the AI to help it understand when to use each tool
 */
const TOOL_DESCRIPTIONS = {
  // Snapshot
  fetch_tenant_snapshot: 'Get a high-level summary of all CRM data: counts of accounts, leads, contacts, opportunities, activities, and aggregate revenue/forecast. Use this first to understand the overall state.',

  // Accounts
  create_account: 'Create a new Account (company/organization) record in the CRM.',
  update_account: 'Update an existing Account record by its ID. Can modify name, revenue, industry, website, email, phone, etc.',
  get_account_details: 'Get the full details of a specific Account by its ID. Returns all fields including name, annual_revenue, industry, website, email, phone, assigned_to, and metadata.',
  list_accounts: 'List Accounts in the CRM. IMPORTANT: If more than 5 results, summarize the count and tell user to check the Accounts page in the UI for the full list. Use industry filter to narrow results.',
  search_accounts: 'Search for Accounts by name, industry, or website. Use this when the user mentions an account by name (e.g., "Acme Corp") to find matching account records.',

  // Leads
  create_lead: 'Create a new Lead (potential prospect) record in the CRM.',
  update_lead: 'Update an existing Lead record by its ID. Can modify name, email, company, status, source, phone, job_title, etc. Use for status changes (new→contacted→qualified).',
  qualify_lead: 'Mark a Lead as qualified. Updates status to "qualified" and prepares it for conversion. Use before convert_lead_to_account.',
  convert_lead_to_account: 'v3.0.0 WORKFLOW: Convert a Lead to Contact + Account + Opportunity. This is the key transition that creates the full customer record. Options: create_account (bool), account_name (string), selected_account_id (UUID for existing account), create_opportunity (bool), opportunity_name, opportunity_amount. Returns contact, account, opportunity.',
  list_leads: '⚠️ NOT FOR COUNTING! Use get_dashboard_bundle for counts. This tool lists individual Lead records. Use ONLY when user wants to SEE the leads, not count them. Pass status filter or "all".',
  search_leads: 'Search for Leads by name, email, or company. ALWAYS use this first when user asks about a lead by name or wants lead details. Use get_lead_details only when you have the lead ID.',
  get_lead_details: 'Get the full details of a specific Lead by its UUID. Only use when you already have the lead_id from a previous search or list.',

  // Activities
  create_activity: 'Create a new Activity (task, meeting, call, email) in the CRM.',
  update_activity: 'Update/reschedule an existing Activity by its ID. Use this for rescheduling - pass activity_id and updates object with new due_date (ISO format like "2025-12-20T13:00:00"). IMPORTANT: Use the activity ID from the previous list/search result - you do NOT need to query again.',
  mark_activity_complete: 'Mark an Activity as completed by its ID. Use the ID from previous list/search results.',
  get_upcoming_activities: 'Get upcoming activities for a SPECIFIC user by their email. Requires assigned_to as the user\'s email address. Use list_activities instead for general calendar queries.',
  schedule_meeting: 'Schedule a new meeting with attendees. Creates a meeting-type activity with date, time, duration, and attendee list.',
  list_activities: 'List all Activities in the CRM. Use this for calendar/schedule queries. Pass status="planned" for upcoming/pending, status="overdue" for overdue, status="completed" for past, or status="all" for everything. IMPORTANT: Results include activity IDs - remember these for follow-up actions like update or complete.',
  search_activities: 'Search for Activities by subject, body, or type. ALWAYS use this first when user asks about an activity by name or keyword. Results include IDs for follow-up actions.',
  get_activity_details: 'Get the full details of a specific Activity by its UUID. Only use when you already have the activity_id from a previous list or search.',
  delete_activity: 'Delete an Activity by its ID. Use with caution - this permanently removes the activity.',




  // Notes
  create_note: 'Create a new Note attached to any CRM record (account, lead, contact, opportunity).',
  update_note: 'Update an existing Note by its ID.',
  search_notes: 'Search notes by keyword across all records.',
  get_notes_for_record: 'Get all notes attached to a specific record (account, lead, contact, or opportunity) by record ID.',
  get_note_details: 'Get the full details of a specific Note by its ID.',

  // Opportunities
  create_opportunity: 'Create a new Opportunity (deal/sale) in the CRM.',
  update_opportunity: 'Update an existing Opportunity by its ID. Can modify name, amount, stage, probability, close_date, etc.',
  list_opportunities_by_stage: 'List Opportunities filtered by stage. FIRST ask user: "Which stage would you like? Options: prospecting, qualification, proposal, negotiation, closed_won, closed_lost, or all?" IMPORTANT: If more than 5 results, summarize the count and tell user to check the Opportunities page in the UI.',
  search_opportunities: 'Search for Opportunities by name or description. Use this when the user mentions an opportunity/deal by name (e.g., "Enterprise License Deal") to find matching opportunities.',
  get_opportunity_details: 'Get the full details of a specific Opportunity by its ID. Returns name, description, amount, stage, probability, close_date, account_id, contact_id.',
  get_opportunity_forecast: 'Get a probability-weighted revenue forecast for all opportunities.',
  mark_opportunity_won: 'Mark an Opportunity as won (closed successfully).',

  // Contacts
  create_contact: 'Create a new Contact (individual person) associated with an Account.',
  update_contact: 'Update an existing Contact by its ID.',
  list_contacts_for_account: 'List all Contacts belonging to a specific Account. IMPORTANT: If more than 5 results, summarize the count and tell user to check the Contacts page in the UI for the full list.',
  get_contact_details: 'Get the full details of a specific Contact by its ID. Returns first_name, last_name, email, phone, job_title, account_id.',
  search_contacts: 'Search contacts by name, email, or other fields.',

  // Web Research
  search_web: 'Search the web for information using a query. Returns search results.',
  fetch_web_page: 'Fetch the content of a specific web page by URL.',
  lookup_company_info: 'Look up publicly available information about a company by name or domain.',

  // Workflows
  list_workflow_templates: 'List all available workflow templates that can be instantiated.',
  get_workflow_template: 'Get details of a specific workflow template including required parameters.',
  instantiate_workflow_template: 'Create and start a new workflow instance from a template with specific parameters.',

  // Telephony
  initiate_call: 'Initiate an AI-powered outbound phone call to a phone number.',
  call_contact: 'Initiate an AI-powered outbound phone call to a Contact by their ID.',
  check_calling_provider: 'Check if a calling provider (CallFluent, Thoughtly) is configured and available.',
  get_calling_agents: 'List available AI calling agents and their configurations.',

  // BizDev Sources (v3.0.0 workflow)
  create_bizdev_source: 'Create a new BizDev Source (business development lead source) for later promotion to a Lead. This is the first step in the v3.0.0 workflow.',
  update_bizdev_source: 'Update an existing BizDev Source by its ID. Can modify source_name, company_name, contact_name, email, phone, priority, status.',
  get_bizdev_source_details: 'Get the full details of a specific BizDev Source by its ID.',
  list_bizdev_sources: 'List BizDev Sources with optional filtering by status (active, promoted, rejected) or priority.',
  search_bizdev_sources: 'Search BizDev Sources by name, company, or contact information.',
  promote_bizdev_source_to_lead: 'Promote a BizDev Source to a Lead. This is the key v3.0.0 workflow transition: BizDev Source → Lead. Creates a Lead with provenance tracking.',
  delete_bizdev_source: 'Delete a BizDev Source by its ID.',
  archive_bizdev_sources: 'Archive multiple BizDev Sources by their IDs (bulk operation).',

  // v3.0.0 Lifecycle Orchestration (complete workflow tools)
  advance_to_lead: 'v3.0.0 WORKFLOW STEP 1: Promote a BizDev Source to a Lead. Updates source status to "promoted", creates Lead with status "new". Returns lead_id for next step.',
  advance_to_qualified: 'v3.0.0 WORKFLOW STEP 2: Mark a Lead as qualified. Updates Lead status from "new" to "qualified". Call this before conversion. Returns ready_for_conversion flag.',
  advance_to_account: 'v3.0.0 WORKFLOW STEP 3: Convert a qualified Lead to Contact + Account + Opportunity. Creates Contact (prospect), optionally creates/links Account, optionally creates Opportunity (prospecting stage).',
  advance_opportunity_stage: 'v3.0.0 WORKFLOW STEP 4: Move an Opportunity through sales stages (prospecting → qualification → proposal → negotiation → closed_won/closed_lost). Auto-calculates probability based on stage.',
  full_lifecycle_advance: 'v3.0.0 COMPLETE WORKFLOW: Execute the full BizDev Source → Lead → Contact + Account + Opportunity lifecycle in a single call. Use for automation scenarios. Combines promote, qualify, and convert steps.',

  // AI Suggestions (Phase 3 Autonomous Operations)
  list_suggestions: 'List AI-generated suggestions by status (pending, approved, rejected, applied, expired, all). These are autonomous recommendations from AI triggers.',
  get_suggestion_details: 'Get full details of a specific AI suggestion including reasoning, confidence score, and suggested action payload.',
  get_suggestion_stats: 'Get statistics about AI suggestions: counts by status, priority, and record type. Useful for dashboard metrics.',
  approve_suggestion: 'Approve a pending AI suggestion, marking it ready for application. Requires reviewer notes.',
  reject_suggestion: 'Reject an AI suggestion with reason. Helps improve future suggestion quality through feedback.',
  apply_suggestion: 'Execute an approved AI suggestion. This performs the suggested action (create, update, etc.) on the target record.',
  trigger_suggestion_generation: 'Manually trigger AI suggestion generation for a specific trigger ID. Runs the trigger logic immediately.',

  // CRM Navigation (v3.0.0 - allows AI to navigate user to pages)
  navigate_to_page: 'Navigate the user to a specific CRM page. Use this when the user says "take me to", "go to", "show me", or "open" a page. Valid pages: dashboard, leads, contacts, accounts, opportunities, activities, calendar, settings, workflows, reports, bizdev-sources, projects, workers, user-management. Optionally pass a record_id to go directly to a specific record.',
  get_current_page: 'Get information about the current page the user is viewing. Useful for context-aware responses.',

  // Documents Management
  list_documents: 'List documents attached to an entity (account, lead, contact, etc.). Pass entity_type and entity_id to filter.',
  get_document_details: 'Get full details of a specific document by its ID.',
  create_document: 'Create a new document record with file metadata. Attach to an entity via entity_type and entity_id.',
  update_document: 'Update document metadata like name, description, or entity assignment.',
  delete_document: 'Delete a document by its ID. The actual file storage may be handled separately.',
  analyze_document: 'Run AI analysis on a document. Pass analysis_type for specific analysis (summary, extract, classify).',
  search_documents: 'Search documents by name or content query.',

  // Employees Management
  list_employees: 'List employees in the organization. Filter by role, department, or active status.',
  get_employee_details: 'Get full details of a specific employee by their ID.',
  create_employee: 'Create a new employee record with name, email, role, and department.',
  update_employee: 'Update employee information like role, department, or contact details.',
  delete_employee: 'Deactivate or delete an employee record.',
  search_employees: 'Search employees by name, email, or role.',
  get_employee_assignments: 'Get all accounts, leads, and activities assigned to an employee.',

  // Users Management (Admin operations)
  list_users: 'List user accounts. Filter by role or active status. Use for user management dashboards.',
  get_user_details: 'Get full details of a specific user by their ID.',
  get_current_user_profile: 'Get the current authenticated user\'s profile.',
  get_user_profiles: 'Get all user profiles for the tenant. Useful for assignment dropdowns.',
  create_user: 'Create a new user account. Requires admin privileges.',
  update_user: 'Update user information like role, email, or permissions. Requires admin privileges.',
  delete_user: 'Delete or deactivate a user account. Requires admin privileges.',
  search_users: 'Search users by name or email.',
  invite_user: 'Send an invitation to a user to join the CRM. Requires admin privileges.',

  // Reports & Analytics
  get_dashboard_bundle: '🚨 REQUIRED for "how many" questions! Returns totalLeads, totalAccounts, totalContacts, totalOpportunities counts. When user asks "how many leads/accounts/contacts/opportunities", ALWAYS call this tool FIRST. Do NOT use list_leads/list_accounts to count - those are for viewing records, not counting.',
  get_health_summary: 'Get a health summary of the CRM data quality and system status.',
  get_sales_report: 'Generate a sales report for a date range. Group by day, week, month, or quarter.',
  get_pipeline_report: 'Get pipeline analysis with opportunity stages, values, and conversion rates.',
  get_activity_report: 'Generate an activity report for a date range. Optionally filter by employee.',
  get_lead_conversion_report: 'Get lead conversion metrics showing funnel stages and conversion rates.',
  get_revenue_forecasts: 'Get revenue forecasts based on pipeline opportunities. Specify months_ahead.',
  clear_report_cache: 'Clear cached report data to force regeneration. Requires admin privileges.',

  // AI-Powered Next Actions (RAG-enabled)
  suggest_next_actions: 'CRITICAL: Call this when user asks "what should I do next?", "what do you think?", "how should I proceed?", or similar open-ended questions. Analyzes entity state (notes, activities, stage) using RAG memory to suggest 2-3 specific next actions with reasoning. REQUIRED when users ask for guidance on next steps. Pass entity_type (lead/contact/account/opportunity) and entity_id.'
};

/**
 * Enhanced system prompt for Executive Assistant
 */
export const BRAID_SYSTEM_PROMPT = `
You are AI-SHA - an AI Super Hi-performing Assistant designed to be an Executive Assistant for CRM operations.

**� STOP! BEFORE ANSWERING "HOW MANY" QUESTIONS - READ THIS! 🛑**

When users ask "how many", "count", "total number of" ANY entity (leads, accounts, contacts, opportunities):

✅ CORRECT APPROACH:
1. Call \`get_dashboard_bundle\` tool (NO parameters needed beyond tenant)
2. Read the stats from the response: totalLeads, totalAccounts, totalContacts, totalOpportunities
3. Report the EXACT number from the stats

❌ WRONG APPROACH (DO NOT DO THIS):
- Calling list_leads, list_accounts, list_contacts to count records
- Fetching records and counting them manually
- Saying "I found X leads" after listing them

**IMPORTANT:** The dashboard bundle returns PRE-CALCULATED totals like totalLeads=50. Do NOT list individual records when asked for counts!

**Example dialogue:**
User: "How many leads do I have?"
You (internally): Call get_dashboard_bundle → stats.totalLeads = 50
You (response): "You have 50 leads in your CRM."

**When to use list/search tools INSTEAD:**
- "Show me my leads" → list_leads (they want to SEE records)
- "Who is John Smith?" → search_leads (they want details)
- "List my top 5 accounts" → list_accounts (they want a list)

**CRITICAL BOUNDARIES:**
- You ONLY have access to data within THIS CRM system for the user's assigned tenant
- You CANNOT access, retrieve, or provide information about other CRMs, external systems, or other tenants
- If asked about "another CRM", "different system", "other tenant", or data outside your scope, politely explain:
  "I can only provide information from your CRM. I don't have access to external systems or other tenants."
- You are bound to the user's tenant context - never attempt to access or discuss data from other tenants

**TEST DATA IDENTIFICATION (CRITICAL):**
- Records have an \`is_test_data\` field that indicates if they are test data
- ONLY use the \`is_test_data\` field to determine if a record is test data
- Do NOT infer test data status from record names, values, or patterns
- If \`is_test_data = false\` or is null, treat the record as REAL production data
- Even if a name contains words like "test", "demo", "sample", "isolation" - if \`is_test_data = false\`, it is REAL data
- Report the EXACT values from tool results - do not substitute, summarize, or "clean up" names
- Never hallucinate or make up record names - use the exact data returned by tools

**AMBIGUOUS TERM HANDLING (CRITICAL):**
When users say vague terms like "client", "customer", "company", or "person", you MUST clarify:
- "Client" or "Customer" could mean: Account, Lead, or Contact
- "Company" could mean: Account or the company field on a Lead
- "Person" could mean: Lead, Contact, or User
- "Deal" or "Sale" typically means: Opportunity

Always ask for clarification: "When you say 'client', do you mean an Account, Lead, or Contact?
- **Account**: A company/organization you do business with
- **Lead**: A potential prospect not yet converted
- **Contact**: An individual person associated with an Account"

Do NOT assume - always clarify ambiguous references before taking action.

**SINGLE-ITEM QUERIES ON CUSTOM TERMINOLOGY (CRITICAL):**
When a user asks about "my [entity]" or "the [entity]" (singular) without specifying WHICH one:
- "What is my cold lead?" → ASK: "Which Cold Lead are you referring to? Please provide a name, company, or status."
- "Show me my task" → ASK: "Which Task? Please provide the subject, date, or type."
- "What's the status of my deal?" → ASK: "Which deal are you referring to? Please provide a name or account."

✅ CORRECT: Ask for clarification (name, status, date, or other identifying info)
❌ WRONG: Call list_* tools and say "I couldn't find it" or offer to list all records

Only list all records when user explicitly says "list", "show all", "display all", or similar.

**TYPO TOLERANCE FOR ENTITY KEYWORDS (CRITICAL):**
Users often make minor typos in entity keywords. Recognize common misspellings as their intended entity:
- "Opportunities": opprtunities, oportunities, opportu nities, opportunity (all mean Opportunities)
- "Accounts": acount, accouts, acounts (all mean Accounts)
- "Contacts": contact, contacs, conacts (all mean Contacts)
- "Activities": activites, activitie, activitys (all mean Activities)
- "Leads": lead, leeds (all mean Leads)

When you see a typo/variation that's close to a known entity keyword, interpret it as that entity.
Do NOT ask for clarification on spelling - just use the closest matching entity type.

**CONVERSATION END PHRASES:**
When the user says any of these phrases, respond with a brief, friendly sign-off and indicate you're going back to standby:
- "Thanks", "Thank you", "Thanks Aisha"
- "Goodbye", "Bye", "Bye Aisha"
- "That's all", "Done", "I'm done"
Example response: "You're welcome! Let me know if you need anything else. Going back to standby."

**Your Capabilities:**
- **CRM Management:** Create, read, update accounts, leads, contacts, opportunities
- **Calendar & Activities:** Schedule meetings, track tasks, manage deadlines
- **Notes & Documentation:** Create, search, and organize notes across all records
- **Sales Pipeline:** Track opportunities, update stages, forecast revenue
- **Web Research:** Search for company information, fetch external data
- **Workflow Automation:** Create workflows from templates with customizable parameters
- **AI Calling:** Initiate outbound calls via CallFluent or Thoughtly AI agents
- **CRM Navigation:** Navigate users to any page in the CRM (dashboard, leads, contacts, accounts, etc.)
- **Proactive Assistance:** Suggest next actions, follow-ups, priority tasks

**CRM NAVIGATION (IMPORTANT):**
- You CAN navigate users to different CRM pages using the navigate_to_page tool
- When user says "take me to", "go to", "show me", "open", or "navigate to" a page, USE the navigate_to_page tool
- Valid pages: dashboard, leads, contacts, accounts, opportunities, activities, calendar, settings, workflows, reports, bizdev-sources, projects, workers, user-management
- Example: User says "Take me to the Leads page" → Call navigate_to_page with page="leads"
- You can also navigate to specific records by passing record_id parameter
- ALWAYS use the tool for navigation requests - do NOT tell users you cannot navigate

**CONVERSATION CONTINUITY & CONTEXT AWARENESS (CRITICAL):**
You MUST maintain awareness of the conversation flow and recent discussion topics:
- When user makes implicit references ("I think I only have 1", "what about that one", "the company"), refer to recent messages
- Track what entities were just discussed (leads, accounts, contacts, opportunities)
- If user says "I think I only have 1" after discussing warm leads, interpret as "I have only 1 warm lead"
- If unclear, reference the recent context: "You mentioned wanting to see warm leads. Did you mean you have only 1 warm lead?"
- NEVER respond with "I'm not sure what action you want to take" for vague statements - use conversation history
- Look at the last 3-5 messages to understand implicit references

**IMPLICIT REFERENCE HANDLING EXAMPLES:**
User: "Show me warm leads"
AiSHA: [calls list_leads with status="warm"]
User: "I think I only have 1"
→ CORRECT: Interpret as confirmation about lead count, respond naturally: "Yes, you have 1 warm lead: [name]. Would you like to see the details?"
→ WRONG: "I'm not sure what action you want to take"

User: "What's the name of my warm lead?"
AiSHA: [calls list_leads, shows Jack Russel]
User: "summarize the notes for me"
→ CORRECT: Understand "the notes" refers to Jack Russel's notes (from session context), call search_notes with entity_id
→ WRONG: Ask "Which entity's notes?"

**PROACTIVE NEXT ACTIONS (CRITICAL - HIGHEST PRIORITY):**
When users ask ANYTHING about recommendations or next steps, you MUST use suggest_next_actions tool:

**Trigger Patterns (USE TOOL FOR ALL OF THESE):**
- "What should I do next?"
- "What do you think?"
- "What are my next steps?"
- "What do you recommend?"
- "How should I proceed?"
- "What's the next step?"
- "What should be my next step?"
- "What do you think my next steps should be?"
- "What should be my next steps?" (any variation)

**MANDATORY BEHAVIOR:**
- NEVER EVER respond with "I'm not sure what action you want to take" when asked about next steps
- ALWAYS call suggest_next_actions tool - it uses AI memory to analyze entity context
- If user is discussing a specific entity (lead, account, contact, opportunity), use that entity's ID from session context
- The tool analyzes: recent notes, activities, stage, last contact date, temperature, and context
- Returns 2-3 specific, actionable next steps with reasoning
- Prioritizes based on urgency, lead temperature, and best practices
- If notes mention "awaiting callback", "left message", or "considering email", suggests appropriate follow-up timing and method

**Example Flow:**
User: "What should be my next steps?"
→ YOU: Call suggest_next_actions(entity_type="lead", entity_id="<from session context>")
→ RETURN: Tool's suggestions with reasoning
→ NEVER say "I'm not sure" - the tool provides intelligent recommendations

**Data Structure Guide (CRITICAL - Matches DB):**
- Accounts: {id, name, annual_revenue, industry, website, email, phone, assigned_to, metadata}
- Leads: {id, first_name, last_name, email, company, status, source, phone, job_title, assigned_to}
- Contacts: {id, first_name, last_name, email, phone, job_title, account_id, assigned_to}
- Opportunities: {id, name, description, amount, stage, probability, close_date, account_id, contact_id, assigned_to}
- Activities: {id, type, subject, body, status, due_date, assigned_to}

**CRITICAL - Getting Counts vs Listing Records:**
**Priority 1: Use Dashboard Aggregations for Counts**
- When user asks "how many [entity]" or "count of [entity]": Use get_dashboard_bundle tool FIRST
- Dashboard bundle returns pre-aggregated counts: totalLeads, totalAccounts, totalContacts, totalOpportunities, openLeads, wonOpportunities, etc.
- This is FASTER, MORE EFFICIENT, and ALWAYS ACCURATE (no duplicate counting issues)
- Example: "How many leads do I have?" → Call get_dashboard_bundle, return totalLeads count
- Example: "How many open opportunities?" → Call get_dashboard_bundle, return openOpportunities count

**Priority 2: List/Search for Details (Not Counts)**
- ONLY use list_leads/search_leads when user wants to SEE the actual records or details
- When user asks "how many leads" or "list all leads": Use list_leads with status="all" to get ALL records
- When user asks about a SPECIFIC lead by name (e.g., "Jennifer Martinez"): Use search_leads first
- When user says "give me information on the lead": Use list_leads with status="all" FIRST to see what leads exist, then get details
- NEVER guess entity IDs - always search or list first to find the actual ID

**LISTING DATA - CLARIFICATION & LIMITS (CRITICAL):**
- Before listing Leads, Activities, or Opportunities: ASK user if they want all records or filter by status/stage
- Example: "Would you like all leads, or should I filter by status (new, contacted, qualified, unqualified, converted)?"
- LIMIT RULE: If a list returns MORE than 5 items, provide a summary count and the first 5, then say:
  "I found [X] [entity type]. Here are the first 5. For the complete list, please check the [Entity] page in the CRM."
- Never read out more than 5 items in voice/chat - it's overwhelming and the UI is better for browsing

**Workflow Templates (Available Categories):**
- lead_management: Lead capture, nurturing, qualification automation
- email_marketing: Welcome emails, follow-up sequences
- sales_pipeline: Opportunity follow-up, deal tracking
- ai_calling: AI-powered outbound calls via CallFluent or Thoughtly
- data_sync: Contact/account synchronization
- task_automation: Activity reminders, scheduling

When creating a workflow, ALWAYS use list_workflow_templates first to see available templates and their required parameters, then use instantiate_workflow_template with the correct parameter values.

**AI Calling (CallFluent & Thoughtly):**
- Use check_calling_provider to verify if a provider is configured before calling
- Use initiate_call to call a phone number directly with context
- Use call_contact to call a contact by their ID (fetches contact info automatically)
- Supported providers: 'callfluent', 'thoughtly'
- Always provide a clear purpose and talking points for the AI agent

**UPDATING RECORDS (CRITICAL):**
- You CAN and SHOULD update CRM records when users request changes
- Use update_activity, update_lead, update_account, update_contact, update_opportunity tools
- When user says "set time to", "change to", "update", "reschedule" - USE the appropriate update tool
- For activity updates: pass activity_id and updates object with fields to change (e.g., {due_date: "2025-12-20T13:00:00"})
- Use the record ID from your previous query - you remember IDs from earlier in the conversation
- NEVER say you are "read-only" or cannot make updates - you HAVE full read/write access
- If an update fails, report the error clearly and suggest next steps

**RECORD IDs - INTERNAL TRACKING (CRITICAL):**
- You MUST internally track record IDs from tool results for follow-up actions
- However, DO NOT display raw UUIDs to users in your responses - they are technical and confusing
- Instead, refer to records by their human-readable names (e.g., "One Charge", "Follow up Call")
- You can say "I have the details saved" or "I can update this for you" without showing the ID
- If the user explicitly asks for the ID or reference number, then provide it
- Example good response:
  "Yes, you have a lead named One Charge with status 'New', sourced from Website.
   Would you like me to do anything with this lead?"
- Example bad response (avoid):
  "Yes, you have a lead named One Charge. Reference: ID be855db9-310b-487b-abd3-544fbb69b17e"
- INTERNAL: Track IDs in your context so you can perform updates - just don't show them to users

**RECORD NOT FOUND - VERIFICATION PROTOCOL (CRITICAL):**
When a search/list returns NO results for an entity the user asked about:
1. **CONFIRM THE SEARCH TERM**: Ask user to verify spelling/name
   - "I couldn't find a lead named 'John Smith'. Could you double-check the name spelling?"
2. **SUGGEST ALTERNATIVES**: Offer to try different approaches
   - "Would you like me to list all leads so you can identify the correct one?"
   - "Should I search by email or company instead?"
3. **CHECK DIFFERENT ENTITY TYPES**: The record might be in a different category
   - "I didn't find 'Acme Corp' as a lead. Would you like me to check Accounts or Contacts instead?"
4. **NEVER ASSUME DATA DOESN'T EXIST**: Empty results could be due to typos or wrong entity type
5. **NEVER report "network error" for empty results**: Empty results are valid - just no matches found

Example good response for not found:
"I couldn't find a lead named 'Jennifer Martin'. A few things to check:
1. Is the spelling correct? (Martinez vs Martin?)
2. Would you like me to list all leads to find a similar name?
3. Should I check Contacts or Accounts instead of Leads?"

**CONTEXT RETENTION (CRITICAL):**
- You MUST remember entities mentioned earlier in the conversation
- When user says "update that lead" or "what about them", refer back to previous context
- If multiple entities were discussed, ask which one they mean
- Keep track of: Lead names, Account names, Activity subjects, IDs from tool results
- If context is unclear, ASK: "Are you referring to the lead 'John Doe' we just discussed?"

**ERROR HANDLING (UPDATED - GRANULAR ERROR TYPES):**
Tool errors now return SPECIFIC error types. Handle each appropriately:

1. **NotFound** (entity: X, id: Y):
   - Record with that ID does not exist OR was deleted
   - NEVER say "network error" - this is NOT a network issue
   - Response: "I couldn't find that [entity]. Can you verify the name or ID?"

2. **ValidationError** (field: X, message: Y):
   - User input was invalid or malformed
   - Response: "There was an issue with [field]: [message]. Can you check the input?"

3. **PermissionDenied** (operation: X, reason: Y):
   - User lacks access or session expired
   - Response: "Access denied for [operation]. You may need to log in again."

4. **NetworkError** (url: X, code: Y):
   - ACTUAL network/connectivity issue (rare)
   - ONLY use "network error" language for THIS error type
   - Response: "I'm having trouble connecting. Please try again in a moment."

5. **Empty arrays/results** = VALID (no matches found):
   - This is NOT an error - just zero matching records
   - Use the "RECORD NOT FOUND - VERIFICATION PROTOCOL" above
   - NEVER say "network error" for empty search results

**Best Practices:**
- Always use tools to fetch current data before answering
- Be proactive: suggest follow-ups, next actions, related records
- Use proper date formats (ISO 8601)
- All operations are tenant-isolated
- Check calendar for conflicts before scheduling
- Before initiating calls, confirm contact has a valid phone number
- When uncertain about which entity (Account/Lead/Contact) is meant, ASK before acting
- When user asks to navigate to a page, USE navigate_to_page tool immediately
- When search returns empty, NEVER assume "network error" - ask user to verify
`;

/**
 * Post-tool summarization layer
 */
export function summarizeToolResult(result, toolName) {
  // Defensive: handle null/undefined results
  if (!result) {
    return `${toolName} returned no data (null/undefined)`;
  }
  
  if (typeof result !== 'object') {
    return `${toolName} returned: ${String(result)}`;
  }
  
  if (result.tag === 'Err') {
    const error = result.error || {};
    // Provide specific, AI-friendly error messages based on error type
    // This helps the AI respond appropriately instead of saying "network error" for everything
    switch (error.tag) {
      case 'NotFound':
        return `${toolName}: ${error.entity || 'Record'} with ID "${error.id || 'unknown'}" was NOT FOUND. This is NOT a network error - the record may not exist or the ID may be incorrect. Suggest verifying the name/ID with the user.`;
      case 'ValidationError':
        return `${toolName}: Validation error - ${error.message || 'Invalid data provided'}. Field: ${error.field || 'unknown'}. Ask the user to verify the input.`;
      case 'PermissionDenied':
        return `${toolName}: Access denied for "${error.operation || 'this operation'}". Reason: ${error.reason || 'insufficient permissions'}. User may need to log in again or contact an administrator.`;
      case 'NetworkError':
        // Only this case is an actual network error
        return `${toolName}: Network error (HTTP ${error.code || 'unknown'}). This may be a temporary connectivity issue. Suggest trying again in a moment.`;
      case 'DatabaseError':
        return `${toolName}: Database error - ${error.message || 'query failed'}. This is a server-side issue, not a user error.`;
      case 'APIError': {
        // Interpret HTTP status code to provide appropriate error message
        // This bridges the gap between Braid's simple error structure and user-friendly messages
        const statusCode = error.code || 500;
        const operation = error.operation || toolName;
        const entity = error.entity || 'Record';
        const entityId = error.id || '';

        if (statusCode === 400) {
          return `${toolName}: Invalid request for ${operation}. ${error.query ? `Search query: "${error.query}"` : 'Please check the input data.'} Ask user to verify the input.`;
        } else if (statusCode === 401 || statusCode === 403) {
          return `${toolName}: Access denied for ${operation}. User may need to log in again or contact an administrator.`;
        } else if (statusCode === 404) {
          return `${toolName}: ${entity}${entityId ? ` (ID: ${entityId})` : ''} was NOT FOUND. This is NOT a network error. Suggest verifying the name/ID with the user, or check a different entity type (Lead vs Contact vs Account).`;
        } else if (statusCode >= 500) {
          return `${toolName}: Server error (HTTP ${statusCode}). This may be a temporary issue. Suggest trying again in a moment.`;
        } else {
          return `${toolName}: API error (HTTP ${statusCode}) for ${operation}. ${entityId ? `Entity: ${entity} ID ${entityId}` : ''}`;
        }
      }
      default:
        return `Error executing ${toolName}: ${error.message || JSON.stringify(error)}`;
    }
  }
  
  const data = result.tag === 'Ok' ? result.value : result;
  
  // Defensive: ensure data exists
  if (!data || typeof data !== 'object') {
    return `${toolName} returned invalid data structure`;
  }
  
  // Snapshot-specific
  if (toolName === 'fetch_tenant_snapshot' && data.accounts) {
    const accountCount = data.accounts.length;
    const totalRevenue = data.accounts.reduce((sum, acc) => sum + (acc.annual_revenue || 0), 0);
    const leadsCount = data.leads?.length || 0;
    const contactsCount = data.contacts?.length || 0;
    const oppsCount = data.opportunities?.length || 0;
    const activitiesCount = data.activities?.length || 0;
    const totalForecast = (data.opportunities || []).reduce((sum, o) => sum + ((o.amount || 0) * (o.probability || 0) / 100), 0);
    
    let summary = `Snapshot loaded: ${accountCount} accounts, ${leadsCount} leads, ${contactsCount} contacts, ${oppsCount} opportunities, ${activitiesCount} activities. `;
    
    if (accountCount > 0) {
      const anyRevenueValues = data.accounts.some(a => typeof a.annual_revenue === 'number' && a.annual_revenue > 0);
      if (anyRevenueValues) {
        summary += `Total revenue: $${totalRevenue.toLocaleString()}. `;
      } else {
        summary += 'No revenue recorded for any account. ';
      }
      const topAccounts = [...data.accounts]
        .filter(a => a.annual_revenue > 0)
        .sort((a, b) => (b.annual_revenue || 0) - (a.annual_revenue || 0))
        .slice(0, 3);
      
      if (topAccounts.length > 0) {
        summary += `Top accounts: ${topAccounts.map(a => `${a.name} ($${(a.annual_revenue || 0).toLocaleString()})`).join(', ')}. `;
      }
    }
    summary += `Pipeline forecast (prob-weighted): $${totalForecast.toLocaleString()}.`;
    return summary;
  }
  
  // Dashboard bundle: Return pre-aggregated stats clearly for count questions
  if (toolName === 'get_dashboard_bundle' && data.stats) {
    const stats = data.stats;
    return `Dashboard Stats: ${stats.totalLeads} leads (${stats.openLeads} open, ${stats.newLeadsLast30Days} new in 30 days), ${stats.totalAccounts} accounts, ${stats.totalContacts} contacts, ${stats.totalOpportunities} opportunities (${stats.openOpportunities} open, ${stats.wonOpportunities} won), Pipeline: $${(stats.pipelineValue || 0).toLocaleString()}, Won: $${(stats.wonValue || 0).toLocaleString()}, Activities (30 days): ${stats.activitiesLast30Days}`;
  }
  
  // Activity-specific: ALWAYS include IDs prominently for follow-up actions
  if (toolName === 'list_activities' || toolName === 'search_activities' || toolName === 'get_upcoming_activities') {
    const activities = Array.isArray(data) ? data : (data.activities || []);
    if (activities.length === 0) {
      return `${toolName}: No activities found matching the criteria.`;
    }

    const summaryItems = activities.slice(0, 5).map(a => {
      return `• ID: ${a.id}, Subject: "${a.subject || 'No subject'}", Type: ${a.type || 'unknown'}, Due: ${a.due_date || 'not set'}, Status: ${a.status || 'unknown'}`;
    });

    let summary = `Found ${activities.length} activit${activities.length === 1 ? 'y' : 'ies'}:\n${summaryItems.join('\n')}`;
    if (activities.length > 5) {
      summary += `\n... and ${activities.length - 5} more`;
    }
    summary += '\n\n**REMEMBER: Use these activity IDs for update_activity, mark_activity_complete, or delete_activity**';
    return summary;
  }

  // Lead-specific: Include names and IDs prominently for follow-up actions and context retention
  if (toolName === 'list_leads' || toolName === 'search_leads') {
    const leads = Array.isArray(data) ? data : (data.leads || data.data || []);
    if (leads.length === 0) {
      return `${toolName}: No leads found matching the criteria. This is a VALID result (no matches), NOT a network error. Consider asking the user to verify the search term or check a different entity type.`;
    }

    // Deduplicate by ID to avoid showing the same lead multiple times
    const seenIds = new Set();
    const uniqueLeads = leads.filter(l => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id);
      return true;
    });

    const summaryItems = uniqueLeads.slice(0, 10).map(l => {
      const fullName = [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed';
      const isTest = l.is_test_data === true ? ' [TEST DATA]' : '';
      return `• ID: ${l.id}, EXACT Name: "${fullName}", Company: "${l.company || 'N/A'}", Status: ${l.status || 'unknown'}${isTest}`;
    });

    let summary = `Found ${uniqueLeads.length} Lead${uniqueLeads.length === 1 ? '' : 's'} (REPORT THESE EXACT NAMES - do not substitute):\n${summaryItems.join('\n')}`;
    if (uniqueLeads.length > 10) {
      summary += `\n... and ${uniqueLeads.length - 10} more`;
    }
    if (uniqueLeads.length < leads.length) {
      summary += `\n\n(Note: ${leads.length - uniqueLeads.length} duplicate${leads.length - uniqueLeads.length === 1 ? '' : 's'} removed from results)`;
    }
    summary += '\n\n**CRITICAL: Use the EXACT names shown above. Do NOT make up different names. If is_test_data is false/null, treat as real data regardless of name.**';
    return summary;
  }

  // Single lead detail
  if (toolName === 'get_lead_details' || toolName === 'update_lead' || toolName === 'create_lead' || toolName === 'qualify_lead') {
    if (data.id) {
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Unnamed';
      return `Lead ID: ${data.id}, Name: "${fullName}", Company: "${data.company || 'N/A'}", Status: ${data.status || 'unknown'}, Email: ${data.email || 'N/A'}, Phone: ${data.phone || 'N/A'}`;
    }
  }

  // BizDev Sources (Cold Leads): EXPLICITLY report exact names - never hallucinate
  if (toolName === 'list_bizdev_sources' || toolName === 'search_bizdev_sources') {
    const sources = Array.isArray(data) ? data : (data.bizdevsources || data.data || []);
    if (sources.length === 0) {
      return `${toolName}: No Cold Leads found matching the criteria. This is a VALID result (no matches), NOT a network error.`;
    }

    const summaryItems = sources.slice(0, 10).map(s => {
      const name = s.source_name || s.source || s.company_name || 'Unnamed';
      const isTest = s.is_test_data === true ? ' [TEST DATA]' : '';
      return `• ID: ${s.id}, EXACT Name: "${name}", Company: "${s.company_name || 'N/A'}", Status: ${s.status || 'unknown'}${isTest}`;
    });

    let summary = `Found ${sources.length} Cold Lead${sources.length === 1 ? '' : 's'} (REPORT THESE EXACT NAMES - do not substitute or change them):\n${summaryItems.join('\n')}`;
    if (sources.length > 10) {
      summary += `\n... and ${sources.length - 10} more`;
    }
    summary += '\n\n**CRITICAL: Use the EXACT names shown above. Do NOT make up different names. If is_test_data is false/null, treat as real data regardless of name.**';
    return summary;
  }

  // Opportunities: EXPLICITLY report exact names - never hallucinate
  if (toolName === 'list_opportunities_by_stage' || toolName === 'search_opportunities') {
    const opps = Array.isArray(data) ? data : (data.opportunities || data.data || []);
    if (opps.length === 0) {
      return `${toolName}: No opportunities found matching the criteria. This is a VALID result (no matches), NOT a network error.`;
    }

    // Deduplicate by ID
    const seenIds = new Set();
    const uniqueOpps = opps.filter(o => {
      if (seenIds.has(o.id)) return false;
      seenIds.add(o.id);
      return true;
    });

    const summaryItems = uniqueOpps.slice(0, 10).map(o => {
      const isTest = o.is_test_data === true ? ' [TEST DATA]' : '';
      const amount = o.amount ? `$${Number(o.amount).toLocaleString()}` : 'N/A';
      return `• ID: ${o.id}, EXACT Name: "${o.name || 'Unnamed'}", Amount: ${amount}, Stage: ${o.stage || 'unknown'}${isTest}`;
    });

    let summary = `Found ${uniqueOpps.length} Opportunit${uniqueOpps.length === 1 ? 'y' : 'ies'} (REPORT THESE EXACT NAMES AND AMOUNTS - do not substitute):\n${summaryItems.join('\n')}`;
    if (uniqueOpps.length > 10) {
      summary += `\n... and ${uniqueOpps.length - 10} more`;
    }
    summary += '\n\n**CRITICAL: Use the EXACT names and amounts shown above. Do NOT make up different names or amounts. If is_test_data is false/null, treat as real data regardless of name.**';
    return summary;
  }

  // Single activity detail
  if (toolName === 'get_activity_details' || toolName === 'update_activity' || toolName === 'create_activity') {
    if (data.id) {
      return `Activity ID: ${data.id}, Subject: "${data.subject || ''}", Type: ${data.type || ''}, Due: ${data.due_date || ''}, Status: ${data.status || ''}`;
    }
  }

  // Account-specific: Include names and IDs for context retention
  if (toolName === 'list_accounts' || toolName === 'search_accounts') {
    const accounts = Array.isArray(data) ? data : (data.accounts || data.data || []);
    if (accounts.length === 0) {
      return `${toolName}: No accounts found matching the criteria. This is a VALID result (no matches), NOT a network error.`;
    }

    // Deduplicate by ID
    const seenIds = new Set();
    const uniqueAccounts = accounts.filter(a => {
      if (seenIds.has(a.id)) return false;
      seenIds.add(a.id);
      return true;
    });

    const summaryItems = uniqueAccounts.slice(0, 10).map(a => {
      const isTest = a.is_test_data === true ? ' [TEST DATA]' : '';
      return `• ID: ${a.id}, EXACT Name: "${a.name || 'Unnamed'}", Industry: "${a.industry || 'N/A'}", Revenue: $${(a.annual_revenue || 0).toLocaleString()}${isTest}`;
    });

    let summary = `Found ${uniqueAccounts.length} Account${uniqueAccounts.length === 1 ? '' : 's'} (REPORT THESE EXACT NAMES - do not substitute):\n${summaryItems.join('\n')}`;
    if (uniqueAccounts.length > 10) {
      summary += `\n... and ${uniqueAccounts.length - 10} more`;
    }
    if (uniqueAccounts.length < accounts.length) {
      summary += `\n\n(Note: ${accounts.length - uniqueAccounts.length} duplicate${accounts.length - uniqueAccounts.length === 1 ? '' : 's'} removed)`;
    }
    summary += '\n\n**CRITICAL: Use the EXACT names shown above. Do NOT make up different names. If is_test_data is false/null, treat as real data regardless of name.**';
    return summary;
  }

  // Single account detail
  if (toolName === 'get_account_details' || toolName === 'update_account' || toolName === 'create_account') {
    if (data.id) {
      return `Account ID: ${data.id}, Name: "${data.name || 'Unnamed'}", Industry: "${data.industry || 'N/A'}", Revenue: $${(data.annual_revenue || 0).toLocaleString()}, Website: ${data.website || 'N/A'}`;
    }
  }

  // Contact-specific: Include names and IDs for context retention
  if (toolName === 'list_contacts_for_account' || toolName === 'search_contacts') {
    const contacts = Array.isArray(data) ? data : (data.contacts || data.data || []);
    if (contacts.length === 0) {
      return `${toolName}: No contacts found matching the criteria. This is a VALID result (no matches), NOT a network error.`;
    }

    // Deduplicate by ID
    const seenIds = new Set();
    const uniqueContacts = contacts.filter(c => {
      if (seenIds.has(c.id)) return false;
      seenIds.add(c.id);
      return true;
    });

    const summaryItems = uniqueContacts.slice(0, 10).map(c => {
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
      const isTest = c.is_test_data === true ? ' [TEST DATA]' : '';
      return `• ID: ${c.id}, EXACT Name: "${fullName}", Title: "${c.job_title || 'N/A'}"${isTest}`;
    });

    let summary = `Found ${uniqueContacts.length} Contact${uniqueContacts.length === 1 ? '' : 's'} (REPORT THESE EXACT NAMES - do not substitute):\n${summaryItems.join('\n')}`;
    if (uniqueContacts.length > 10) {
      summary += `\n... and ${uniqueContacts.length - 10} more`;
    }
    if (uniqueContacts.length < contacts.length) {
      summary += `\n\n(Note: ${contacts.length - uniqueContacts.length} duplicate${contacts.length - uniqueContacts.length === 1 ? '' : 's'} removed)`;
    }
    summary += '\n\n**CRITICAL: Use the EXACT names shown above. Do NOT make up different names. If is_test_data is false/null, treat as real data regardless of name.**';
    return summary;
  }

  // Single contact detail
  if (toolName === 'get_contact_details' || toolName === 'update_contact' || toolName === 'create_contact') {
    if (data.id) {
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Unnamed';
      return `Contact ID: ${data.id}, Name: "${fullName}", Title: "${data.job_title || 'N/A'}", Email: ${data.email || 'N/A'}, Phone: ${data.phone || 'N/A'}`;
    }
  }

  // Generic
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return `${toolName} returned empty object`;
    // Include id if present
    if (data.id) {
      return `${toolName} returned record with ID: ${data.id}, fields: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
    }
    return `${toolName} result with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
  }
  
  return `${toolName} result: ${data}`;
}

/**
 * Generate OpenAI tool schemas from all registered Braid tools
 */
export async function generateToolSchemas(allowedTools = null) {
  const schemas = [];
  console.log('[Braid] Generating tool schemas from', TOOLS_DIR);
  const filterSet = normalizeToolFilter(allowedTools);
  const registryEntries = Object.entries(TOOL_REGISTRY).filter(([name]) => !name.startsWith('delete_'));
  for (const [toolName, config] of registryEntries) {
    if (filterSet && !filterSet.has(toolName)) {
      continue;
    }
    const braidPath = path.join(TOOLS_DIR, config.file);
    try {
      console.log(`[Braid] Loading schema: ${toolName} -> ${braidPath}#${config.function}`);
      const schema = await loadToolSchema(braidPath, config.function);
      if (!schema || !schema.function) {
        console.warn(`[Braid] Schema empty for ${toolName} (${braidPath}). Skipping.`);
        continue;
      }
      // Override name to match registry
      schema.function.name = toolName;
      // Use human-readable description if available
      if (TOOL_DESCRIPTIONS[toolName]) {
        schema.function.description = TOOL_DESCRIPTIONS[toolName];
      }
      schemas.push(schema);
    } catch (error) {
      console.error(`[Braid] Failed to load schema for ${toolName} at ${braidPath}:`, error?.stack || error?.message || error);
      // Continue with other tools
    }
  }
  console.log(`[Braid] Loaded ${schemas.length} tool schemas`);
  return schemas;
}

function normalizeToolFilter(allowedTools) {
  if (!allowedTools) return null;
  if (allowedTools instanceof Set) return allowedTools;
  if (Array.isArray(allowedTools)) return new Set(allowedTools);
  return null;
}

/**
 * SECURITY: Verification token that must be passed to unlock tool execution.
 * This acts as a "key" that can only be obtained after tenant authorization passes.
 * The token is a simple object with verified: true to prevent accidental bypasses.
 */
export const TOOL_ACCESS_TOKEN = Object.freeze({
  verified: true,
  timestamp: Date.now(),
  source: 'tenant-authorization'
});

/**
 * Validates the tool access token before allowing execution.
 * @param {Object} accessToken - The access token to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateToolAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'object') {
    return false;
  }
  // Must have verified: true explicitly set
  if (accessToken.verified !== true) {
    return false;
  }
  // Must have a valid source identifier
  if (accessToken.source !== 'tenant-authorization') {
    return false;
  }
  return true;
}

/**
 * Execute a Braid tool
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments for the tool
 * @param {Object} tenantRecord - The tenant record (must be pre-authorized)
 * @param {string} userId - The user ID
 * @param {Object} accessToken - REQUIRED: Security token proving tenant authorization passed (default: false = denied)
 */
export async function executeBraidTool(toolName, args, tenantRecord, userId = null, accessToken = false) {
  // SECURITY: Verify the access token before any tool execution
  // This is the "key to the toolshed" - without it, no tools can be accessed
  if (!validateToolAccessToken(accessToken)) {
    console.error('[Braid Security] Tool execution DENIED - invalid or missing access token', {
      toolName,
      hasToken: !!accessToken,
      tokenVerified: accessToken?.verified,
      tokenSource: accessToken?.source,
      tenantId: tenantRecord?.id || tenantRecord?.tenant_id,
      userId
    });
    return {
      tag: 'Err',
      error: { 
        type: 'AuthorizationError', 
        message: "I'm sorry, but I cannot execute this action without proper authorization. Please ensure you're logged in and have access to this tenant." 
      }
    };
  }

  const config = TOOL_REGISTRY[toolName];
  if (!config) {
    return {
      tag: 'Err',
      error: { type: 'UnknownTool', message: `Tool '${toolName}' not found in registry` }
    };
  }
  
  const braidPath = path.join(TOOLS_DIR, config.file);
  // Attach execution context so audit logs include tenant/user and tenant isolation has data
  const basePolicy = CRM_POLICIES[config.policy];
  
  // Extract user info from access token for audit logging
  const userRole = accessToken?.user_role || 'user';
  const userEmail = accessToken?.user_email || null;
  
  // === ROLE-BASED ACCESS CONTROL ===
  // Check if the tool requires specific roles and verify user has permission
  if (basePolicy?.required_roles && basePolicy.required_roles.length > 0) {
    const hasRequiredRole = basePolicy.required_roles.includes(userRole);
    
    if (!hasRequiredRole) {
      console.warn('[Braid Security] Tool execution DENIED - insufficient role', {
        toolName,
        policy: config.policy,
        requiredRoles: basePolicy.required_roles,
        userRole,
        userId,
        tenantId: tenantRecord?.id
      });
      return {
        tag: 'Err',
        error: {
          type: 'InsufficientPermissions',
          message: `This operation requires ${basePolicy.required_roles.join(' or ')} role. Your current role (${userRole}) does not have permission.`
        }
      };
    }
  }

  // === RATE LIMITING ===
  // Check rate limits based on policy tool class
  if (basePolicy?.rate_limit) {
    const rateLimitKey = `braid:ratelimit:${tenantRecord?.id}:${userId || 'anonymous'}:${basePolicy.tool_class || 'default'}`;
    try {
      const currentCount = await cacheManager.get(rateLimitKey) || 0;
      const limit = basePolicy.rate_limit.requests_per_minute;
      
      if (currentCount >= limit) {
        console.warn('[Braid Security] Rate limit exceeded', {
          toolName,
          toolClass: basePolicy.tool_class,
          currentCount,
          limit,
          userId,
          tenantId: tenantRecord?.id
        });
        return {
          tag: 'Err',
          error: {
            type: 'RateLimitExceeded',
            message: `Rate limit exceeded for ${basePolicy.tool_class} operations. Please wait a moment before trying again.`,
            retryAfter: 60
          }
        };
      }
      
      // Increment the counter (TTL of 60 seconds for per-minute limiting)
      await cacheManager.set(rateLimitKey, currentCount + 1, 60);
    } catch (rateLimitErr) {
      // Don't block on rate limit errors, just log
      console.warn('[Braid Security] Rate limit check failed:', rateLimitErr.message);
    }
  }

  // === DELETE CONFIRMATION CHECK ===
  // For DELETE_OPERATIONS policy, require explicit confirmation
  if (basePolicy?.requires_confirmation && toolName.includes('delete')) {
    const confirmationProvided = args?.confirmed === true || args?.force === true;
    if (!confirmationProvided) {
      console.log('[Braid Security] Delete operation requires confirmation', { toolName, userId });
      return {
        tag: 'Err',
        error: {
          type: 'ConfirmationRequired',
          message: `This delete operation requires confirmation. Please provide { confirmed: true } to proceed.`,
          action: 'confirm_delete',
          toolName
        }
      };
    }
  }

  const policy = {
    ...basePolicy,
    context: {
      ...(basePolicy?.context || {}),
      tenant_id: tenantRecord?.tenant_id || null,
      user_id: userId || null
    }
  };
  // CRITICAL: Use tenantRecord.id (UUID) not tenant_id (slug) for API calls
  const tenantUuid = tenantRecord?.id || tenantRecord?.tenant_id || null;
  
  // Generate internal service JWT for server-to-server API calls
  const internalToken = jwt.sign(
    { sub: userId, tenant_id: tenantUuid, internal: true },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  // Use CRM_BACKEND_URL (set in docker-compose) or BACKEND_URL or sensible default
  // Inside Docker: CRM_BACKEND_URL=http://backend:3001
  // Outside Docker: BACKEND_URL=http://localhost:4001
  const backendUrl = process.env.CRM_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:4001';
  const deps = createBackendDeps(backendUrl, tenantUuid, userId, internalToken);

  // Normalize arguments into a single object for Braid
  const normalizedArgs = normalizeToolArgs(toolName, args, tenantRecord);

  // Convert object args to positional array based on function signature
  const positionalArgs = objectToPositionalArgs(toolName, normalizedArgs);

  console.log(`[Braid Tool] Executing ${toolName}`, {
    braidPath,
    function: config.function,
    tenantUuid,
    argsPreview: JSON.stringify(positionalArgs).substring(0, 200)
  });

  // Check Redis cache for READ_ONLY tools
  const isReadOnly = config.policy === 'READ_ONLY';
  const cacheKey = generateBraidCacheKey(toolName, tenantUuid, normalizedArgs);

  if (isReadOnly) {
    try {
      const cachedResult = await cacheManager.get(cacheKey);
      if (cachedResult !== null) {
        console.log(`[Braid Tool] Cache HIT for ${toolName}`, { cacheKey: cacheKey.substring(0, 60) });
        
        // Track cache hit in real-time metrics
        trackRealtimeMetrics(tenantUuid, toolName, true, true, 0);
        
        // Log cache hit to audit (async, don't await)
        logAuditEntry({
          toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
          normalizedArgs, result: cachedResult, executionTimeMs: 0, cacheHit: true, supabase: deps.supabase
        });
        
        return cachedResult;
      }
      console.log(`[Braid Tool] Cache MISS for ${toolName}`, { cacheKey: cacheKey.substring(0, 60) });
    } catch (cacheErr) {
      // Cache errors should never block tool execution
      console.warn(`[Braid Tool] Cache lookup failed for ${toolName}:`, cacheErr.message);
    }
  }

  // Start timing for audit
  const startTime = Date.now();
  
  try {
    const result = await executeBraid(
      braidPath,
      config.function,
      policy,
      deps,
      positionalArgs,
      { cache: false, timeout: 30000 } // Disable in-memory cache, use Redis instead
    );
    
    console.log(`[Braid Tool] ${toolName} completed`, {
      resultTag: result?.tag,
      hasError: !!result?.error,
      errorType: result?.error?.type,
      errorMsg: result?.error?.message?.substring?.(0, 200)
    });

    // Cache successful READ_ONLY results in Redis
    if (isReadOnly && result?.tag === 'Ok') {
      try {
        const ttl = TOOL_CACHE_TTL[toolName] || TOOL_CACHE_TTL.DEFAULT;
        await cacheManager.set(cacheKey, result, ttl);
        console.log(`[Braid Tool] Cached ${toolName} result for ${ttl}s`);
      } catch (cacheErr) {
        // Cache errors should never block tool execution
        console.warn(`[Braid Tool] Cache store failed for ${toolName}:`, cacheErr.message);
      }
    }

    // Invalidate cache for WRITE operations (ensures fresh data after mutations)
    if (!isReadOnly && result?.tag === 'Ok') {
      try {
        // Determine which entity type was modified
        const entityPatterns = {
          lead: /^(create|update|delete|qualify|convert)_lead/,
          account: /^(create|update|delete)_account/,
          contact: /^(create|update|delete)_contact/,
          opportunity: /^(create|update|delete|mark_opportunity)_opportunity/,
          activity: /^(create|update|delete|mark_activity|schedule)_(activity|meeting)/,
          note: /^(create|update|delete)_note/,
          bizdev: /^(create|update|delete|promote|archive)_bizdev/,
        };

        let invalidatedEntity = null;
        for (const [entity, pattern] of Object.entries(entityPatterns)) {
          if (pattern.test(toolName)) {
            invalidatedEntity = entity;
            break;
          }
        }

        if (invalidatedEntity && tenantUuid) {
          // Invalidate all braid cache keys for this tenant and entity type
          const _pattern = `braid:${tenantUuid}:*${invalidatedEntity}*`;
          console.log(`[Braid Tool] Invalidating cache for ${invalidatedEntity} (tenant: ${tenantUuid?.substring(0, 8)}...)`);
          await cacheManager.invalidateTenant(tenantUuid, 'braid');
        }
      } catch (cacheErr) {
        // Cache errors should never block tool execution
        console.warn(`[Braid Tool] Cache invalidation failed for ${toolName}:`, cacheErr.message);
      }
    }

    // Calculate execution time
    const executionTimeMs = Date.now() - startTime;

    // Track real-time metrics (Redis)
    trackRealtimeMetrics(tenantUuid, toolName, result?.tag === 'Ok', false, executionTimeMs);

    // Log to audit (async, don't await to avoid blocking response)
    logAuditEntry({
      toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
      normalizedArgs, result, executionTimeMs, cacheHit: false, supabase: deps.supabase
    });

    // Apply field-level filtering based on user role (mask sensitive data)
    if (result?.tag === 'Ok' && result?.value) {
      const entityType = extractEntityType(toolName);
      if (entityType) {
        const filteredValue = filterSensitiveFields(result.value, entityType, userRole);
        return { ...result, value: filteredValue };
      }
    }

    return result;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    console.error(`[Braid Tool] ${toolName} EXCEPTION`, error.message, error.stack?.substring?.(0, 300));
    
    const errorResult = {
      tag: 'Err',
      error: { type: 'ExecutionError', message: error.message, stack: error.stack }
    };
    
    // Track error in real-time metrics
    trackRealtimeMetrics(tenantUuid, toolName, false, false, executionTimeMs);

    // Log error to audit (async, don't await)
    logAuditEntry({
      toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
      normalizedArgs, result: errorResult, executionTimeMs, cacheHit: false, supabase: deps.supabase
    });
    
    return errorResult;
  }
}

// ============================================================================
// TOOL CHAINING - Compose multiple tools into atomic workflows
// ============================================================================

/**
 * Predefined Tool Chains - Multi-step workflows that can be executed atomically
 * Each chain defines:
 * - steps: Array of tool calls with argument mapping
 * - rollback: Optional steps to undo on failure
 * - required_role: Minimum role to execute this chain
 * - policy: Overall policy (uses most restrictive from steps)
 */
export const TOOL_CHAINS = {
  // Lead to Opportunity conversion workflow
  lead_to_opportunity: {
    name: 'Lead to Opportunity',
    description: 'Qualify a lead, convert to account, and create opportunity',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'qualify',
        tool: 'qualify_lead',
        args: (input, _ctx) => ({
          lead_id: input.lead_id,
          notes: input.qualification_notes || 'Auto-qualified via chain'
        }),
        required: true
      },
      {
        id: 'convert',
        tool: 'convert_lead_to_account',
        args: (input, ctx) => ({
          lead_id: input.lead_id,
          options: {
            create_opportunity: false, // We'll create it manually with more control
            account_name: ctx.qualify?.value?.lead?.company || input.company_name
          }
        }),
        required: true,
        condition: (ctx) => ctx.qualify?.tag === 'Ok'
      },
      {
        id: 'opportunity',
        tool: 'create_opportunity',
        args: (input, ctx) => ({
          account_id: ctx.convert?.value?.account?.id,
          name: input.opportunity_name || `${ctx.convert?.value?.account?.name || 'New'} Opportunity`,
          amount: input.amount || 0,
          stage: input.stage || 'qualification',
          close_date: input.close_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          probability: input.probability || 25
        }),
        required: false, // Optional step
        condition: (ctx) => ctx.convert?.tag === 'Ok' && ctx.convert?.value?.account?.id
      }
    ],
    rollback: [
      // Rollback opportunity if created
      { tool: 'delete_opportunity', args: (ctx) => ({ opportunity_id: ctx.opportunity?.value?.id, confirmed: true }), condition: (ctx) => ctx.opportunity?.tag === 'Ok' },
      // Note: We don't rollback account conversion as it's a significant business event
    ]
  },

  // Account setup with primary contact
  account_with_contact: {
    name: 'Account with Contact',
    description: 'Create an account and add a primary contact',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'account',
        tool: 'create_account',
        args: (input, _ctx) => ({
          name: input.account_name || input.company_name,
          industry: input.industry,
          website: input.website,
          email: input.company_email,
          phone: input.company_phone,
          annual_revenue: input.annual_revenue
        }),
        required: true
      },
      {
        id: 'contact',
        tool: 'create_contact',
        args: (input, ctx) => ({
          account_id: ctx.account?.value?.id,
          first_name: input.contact_first_name,
          last_name: input.contact_last_name,
          email: input.contact_email,
          phone: input.contact_phone,
          title: input.contact_title || 'Primary Contact',
          is_primary: true
        }),
        required: false,
        condition: (ctx) => ctx.account?.tag === 'Ok' && (input.contact_first_name || input.contact_email)
      }
    ],
    rollback: [
      { tool: 'delete_contact', args: (ctx) => ({ contact_id: ctx.contact?.value?.id, confirmed: true }), condition: (ctx) => ctx.contact?.tag === 'Ok' },
      { tool: 'delete_account', args: (ctx) => ({ account_id: ctx.account?.value?.id, confirmed: true }), condition: (ctx) => ctx.account?.tag === 'Ok' }
    ]
  },

  // Schedule activity after opportunity creation
  opportunity_with_followup: {
    name: 'Opportunity with Follow-up',
    description: 'Create an opportunity and schedule a follow-up activity',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'opportunity',
        tool: 'create_opportunity',
        args: (input, _ctx) => ({
          account_id: input.account_id,
          name: input.opportunity_name,
          amount: input.amount,
          stage: input.stage || 'qualification',
          close_date: input.close_date,
          probability: input.probability
        }),
        required: true
      },
      {
        id: 'followup',
        tool: 'create_activity',
        args: (input, ctx) => ({
          subject: input.followup_subject || `Follow-up: ${ctx.opportunity?.value?.name}`,
          activity_type: input.activity_type || 'call',
          due_date: input.followup_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          assigned_to: input.assigned_to,
          related_to_type: 'opportunity',
          related_to_id: ctx.opportunity?.value?.id,
          body: input.followup_notes || 'Initial follow-up call'
        }),
        required: false,
        condition: (ctx) => ctx.opportunity?.tag === 'Ok'
      }
    ]
  },

  // Bulk lead qualification
  bulk_qualify_leads: {
    name: 'Bulk Qualify Leads',
    description: 'Qualify multiple leads at once',
    required_role: 'admin',
    policy: 'ADMIN_ONLY',
    dynamic: true, // Steps are generated from input array
    generateSteps: (input) => {
      if (!Array.isArray(input.lead_ids) || input.lead_ids.length === 0) {
        return [];
      }
      return input.lead_ids.map((leadId, index) => ({
        id: `qualify_${index}`,
        tool: 'qualify_lead',
        args: () => ({
          lead_id: leadId,
          notes: input.notes || 'Bulk qualification'
        }),
        required: false // Allow partial success
      }));
    }
  },

  // Research and enrich account
  research_account: {
    name: 'Research and Enrich Account',
    description: 'Look up company info and update account with findings',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'get_account',
        tool: 'get_account_details',
        args: (input, _ctx) => ({
          account_id: input.account_id
        }),
        required: true
      },
      {
        id: 'research',
        tool: 'lookup_company_info',
        args: (input, ctx) => ({
          company_name: ctx.get_account?.value?.name,
          domain: ctx.get_account?.value?.website
        }),
        required: false,
        condition: (ctx) => ctx.get_account?.tag === 'Ok'
      },
      {
        id: 'update',
        tool: 'update_account',
        args: (input, ctx) => ({
          account_id: input.account_id,
          updates: {
            industry: ctx.research?.value?.industry || ctx.get_account?.value?.industry,
            annual_revenue: ctx.research?.value?.revenue || ctx.get_account?.value?.annual_revenue,
            website: ctx.research?.value?.website || ctx.get_account?.value?.website,
            metadata: {
              ...(ctx.get_account?.value?.metadata || {}),
              last_enriched: new Date().toISOString(),
              enrichment_source: 'web_research'
            }
          }
        }),
        required: false,
        condition: (ctx) => ctx.research?.tag === 'Ok' && ctx.research?.value
      }
    ]
  }
};

// ============================================================================
// TOOL DEPENDENCY GRAPH
// Maps tool relationships, categories, and dependencies for visualization
// ============================================================================

/**
 * Tool categories for grouping in visualizations
 */
export const TOOL_CATEGORIES = {
  ACCOUNTS: {
    name: 'Accounts',
    color: '#3B82F6', // blue
    icon: 'building'
  },
  CONTACTS: {
    name: 'Contacts',
    color: '#10B981', // green
    icon: 'users'
  },
  LEADS: {
    name: 'Leads',
    color: '#F59E0B', // amber
    icon: 'target'
  },
  OPPORTUNITIES: {
    name: 'Opportunities',
    color: '#8B5CF6', // purple
    icon: 'trending-up'
  },
  ACTIVITIES: {
    name: 'Activities',
    color: '#EC4899', // pink
    icon: 'calendar'
  },
  REPORTS: {
    name: 'Reports',
    color: '#6366F1', // indigo
    icon: 'bar-chart'
  },
  SYSTEM: {
    name: 'System',
    color: '#6B7280', // gray
    icon: 'settings'
  },
  AI: {
    name: 'AI/Intelligence',
    color: '#14B8A6', // teal
    icon: 'brain'
  }
};

/**
 * Tool Dependency Graph
 * 
 * Each tool entry contains:
 * - category: Which category this tool belongs to
 * - dependencies: Tools this tool commonly calls or requires data from
 * - dependents: Tools that commonly call this tool (computed)
 * - inputs: Required input entities
 * - outputs: Entities this tool creates or modifies
 * - effects: Side effects (create, update, delete, read)
 * - description: Human-readable description
 */
export const TOOL_GRAPH = {
  // ========== ACCOUNTS ==========
  create_account: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: [],
    outputs: ['account'],
    effects: ['create'],
    description: 'Create a new account/company record'
  },
  get_account: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: ['account_id'],
    outputs: ['account'],
    effects: ['read'],
    description: 'Retrieve account details by ID'
  },
  search_accounts: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: [],
    outputs: ['accounts[]'],
    effects: ['read'],
    description: 'Search accounts with filters'
  },
  update_account: {
    category: 'ACCOUNTS',
    dependencies: ['get_account'],
    inputs: ['account_id'],
    outputs: ['account'],
    effects: ['update'],
    description: 'Update account fields'
  },
  delete_account: {
    category: 'ACCOUNTS',
    dependencies: ['get_account'],
    inputs: ['account_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete an account (cascades to related records)'
  },

  // ========== CONTACTS ==========
  create_contact: {
    category: 'CONTACTS',
    dependencies: ['get_account'],
    inputs: ['account_id'],
    outputs: ['contact'],
    effects: ['create'],
    description: 'Create a contact linked to an account'
  },
  get_contact: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['contact_id'],
    outputs: ['contact'],
    effects: ['read'],
    description: 'Retrieve contact details by ID'
  },
  search_contacts: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: [],
    outputs: ['contacts[]'],
    effects: ['read'],
    description: 'Search contacts with filters'
  },
  update_contact: {
    category: 'CONTACTS',
    dependencies: ['get_contact'],
    inputs: ['contact_id'],
    outputs: ['contact'],
    effects: ['update'],
    description: 'Update contact fields'
  },
  delete_contact: {
    category: 'CONTACTS',
    dependencies: ['get_contact'],
    inputs: ['contact_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete a contact'
  },

  // ========== LEADS ==========
  create_lead: {
    category: 'LEADS',
    dependencies: [],
    inputs: [],
    outputs: ['lead'],
    effects: ['create'],
    description: 'Create a new lead'
  },
  get_lead: {
    category: 'LEADS',
    dependencies: [],
    inputs: ['lead_id'],
    outputs: ['lead'],
    effects: ['read'],
    description: 'Retrieve lead details by ID'
  },
  search_leads: {
    category: 'LEADS',
    dependencies: [],
    inputs: [],
    outputs: ['leads[]'],
    effects: ['read'],
    description: 'Search leads with filters'
  },
  update_lead: {
    category: 'LEADS',
    dependencies: ['get_lead'],
    inputs: ['lead_id'],
    outputs: ['lead'],
    effects: ['update'],
    description: 'Update lead fields'
  },
  qualify_lead: {
    category: 'LEADS',
    dependencies: ['get_lead'],
    inputs: ['lead_id'],
    outputs: ['lead'],
    effects: ['update'],
    description: 'Mark lead as qualified'
  },
  convert_lead_to_account: {
    category: 'LEADS',
    dependencies: ['get_lead', 'qualify_lead'],
    inputs: ['lead_id'],
    outputs: ['account', 'contact', 'opportunity'],
    effects: ['create', 'update'],
    description: 'Convert qualified lead to account with optional contact and opportunity'
  },
  delete_lead: {
    category: 'LEADS',
    dependencies: ['get_lead'],
    inputs: ['lead_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete a lead'
  },

  // ========== OPPORTUNITIES ==========
  create_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: ['get_account'],
    inputs: ['account_id'],
    outputs: ['opportunity'],
    effects: ['create'],
    description: 'Create an opportunity for an account'
  },
  get_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: [],
    inputs: ['opportunity_id'],
    outputs: ['opportunity'],
    effects: ['read'],
    description: 'Retrieve opportunity details by ID'
  },
  search_opportunities: {
    category: 'OPPORTUNITIES',
    dependencies: [],
    inputs: [],
    outputs: ['opportunities[]'],
    effects: ['read'],
    description: 'Search opportunities with filters'
  },
  update_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: ['get_opportunity'],
    inputs: ['opportunity_id'],
    outputs: ['opportunity'],
    effects: ['update'],
    description: 'Update opportunity fields'
  },
  advance_opportunity_stage: {
    category: 'OPPORTUNITIES',
    dependencies: ['get_opportunity'],
    inputs: ['opportunity_id'],
    outputs: ['opportunity'],
    effects: ['update'],
    description: 'Move opportunity to next pipeline stage'
  },
  delete_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: ['get_opportunity'],
    inputs: ['opportunity_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete an opportunity'
  },

  // ========== ACTIVITIES ==========
  create_activity: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['entity_type', 'entity_id'],
    outputs: ['activity'],
    effects: ['create'],
    description: 'Schedule an activity (call, meeting, task, email)'
  },
  get_activity: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['activity_id'],
    outputs: ['activity'],
    effects: ['read'],
    description: 'Retrieve activity details by ID'
  },
  search_activities: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: [],
    outputs: ['activities[]'],
    effects: ['read'],
    description: 'Search activities with filters'
  },
  update_activity: {
    category: 'ACTIVITIES',
    dependencies: ['get_activity'],
    inputs: ['activity_id'],
    outputs: ['activity'],
    effects: ['update'],
    description: 'Update activity fields'
  },
  complete_activity: {
    category: 'ACTIVITIES',
    dependencies: ['get_activity'],
    inputs: ['activity_id'],
    outputs: ['activity'],
    effects: ['update'],
    description: 'Mark activity as completed'
  },
  delete_activity: {
    category: 'ACTIVITIES',
    dependencies: ['get_activity'],
    inputs: ['activity_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete an activity'
  },

  // ========== REPORTS ==========
  get_pipeline_report: {
    category: 'REPORTS',
    dependencies: ['search_opportunities'],
    inputs: [],
    outputs: ['report'],
    effects: ['read'],
    description: 'Generate pipeline summary report'
  },
  get_activity_report: {
    category: 'REPORTS',
    dependencies: ['search_activities'],
    inputs: [],
    outputs: ['report'],
    effects: ['read'],
    description: 'Generate activity metrics report'
  },
  get_lead_conversion_report: {
    category: 'REPORTS',
    dependencies: ['search_leads'],
    inputs: [],
    outputs: ['report'],
    effects: ['read'],
    description: 'Generate lead conversion funnel report'
  },
  get_dashboard_metrics: {
    category: 'REPORTS',
    dependencies: ['search_accounts', 'search_leads', 'search_opportunities', 'search_activities'],
    inputs: [],
    outputs: ['metrics'],
    effects: ['read'],
    description: 'Aggregate dashboard KPIs'
  },

  // ========== AI/INTELLIGENCE ==========
  ai_suggest_next_action: {
    category: 'AI',
    dependencies: ['get_account', 'search_activities', 'search_opportunities'],
    inputs: ['entity_type', 'entity_id'],
    outputs: ['suggestions[]'],
    effects: ['read'],
    description: 'AI-powered next best action recommendations'
  },
  ai_score_lead: {
    category: 'AI',
    dependencies: ['get_lead', 'search_leads'],
    inputs: ['lead_id'],
    outputs: ['score', 'factors'],
    effects: ['read', 'update'],
    description: 'AI-powered lead scoring'
  },
  ai_summarize_account: {
    category: 'AI',
    dependencies: ['get_account', 'search_contacts', 'search_opportunities', 'search_activities'],
    inputs: ['account_id'],
    outputs: ['summary'],
    effects: ['read'],
    description: 'AI-generated account summary and insights'
  },
  web_research: {
    category: 'AI',
    dependencies: [],
    inputs: ['company_name', 'domain'],
    outputs: ['research_data'],
    effects: ['read'],
    description: 'Research company information from web sources'
  },

  // ========== SYSTEM ==========
  get_current_user: {
    category: 'SYSTEM',
    dependencies: [],
    inputs: [],
    outputs: ['user'],
    effects: ['read'],
    description: 'Get current authenticated user info'
  },
  get_tenant_config: {
    category: 'SYSTEM',
    dependencies: [],
    inputs: [],
    outputs: ['config'],
    effects: ['read'],
    description: 'Get tenant configuration and settings'
  }
};

/**
 * Get dependencies for a tool (what it needs)
 * @param {string} toolName - Tool to get dependencies for
 * @returns {{ direct: string[], transitive: string[] }}
 */
export function getToolDependencies(toolName) {
  const tool = TOOL_GRAPH[toolName];
  if (!tool) {
    return { direct: [], transitive: [], error: `Unknown tool: ${toolName}` };
  }

  const direct = tool.dependencies || [];
  const transitive = new Set();
  const visited = new Set([toolName]);

  function collectTransitive(deps) {
    for (const dep of deps) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      transitive.add(dep);
      
      const depTool = TOOL_GRAPH[dep];
      if (depTool?.dependencies) {
        collectTransitive(depTool.dependencies);
      }
    }
  }

  collectTransitive(direct);

  return {
    direct,
    transitive: Array.from(transitive).filter(t => !direct.includes(t))
  };
}

/**
 * Get dependents for a tool (what depends on it)
 * @param {string} toolName - Tool to get dependents for
 * @returns {{ direct: string[], transitive: string[] }}
 */
export function getToolDependents(toolName) {
  if (!TOOL_GRAPH[toolName]) {
    return { direct: [], transitive: [], error: `Unknown tool: ${toolName}` };
  }

  // Build reverse dependency map
  const directDependents = [];
  for (const [name, config] of Object.entries(TOOL_GRAPH)) {
    if (config.dependencies?.includes(toolName)) {
      directDependents.push(name);
    }
  }

  // Collect transitive dependents
  const transitive = new Set();
  const visited = new Set([toolName]);

  function collectTransitive(deps) {
    for (const dep of deps) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      transitive.add(dep);

      // Find tools that depend on this dependent
      for (const [name, config] of Object.entries(TOOL_GRAPH)) {
        if (config.dependencies?.includes(dep) && !visited.has(name)) {
          collectTransitive([name]);
        }
      }
    }
  }

  collectTransitive(directDependents);

  return {
    direct: directDependents,
    transitive: Array.from(transitive).filter(t => !directDependents.includes(t))
  };
}

/**
 * Get the full tool graph for visualization
 * @param {Object} options - Filter options
 * @returns {Object} Graph data in format suitable for visualization libraries
 */
export function getToolGraph(options = {}) {
  const { category, includeMetadata = true, format = 'nodes-edges' } = options;

  const nodes = [];
  const edges = [];

  for (const [name, config] of Object.entries(TOOL_GRAPH)) {
    // Filter by category if specified
    if (category && config.category !== category) continue;

    const categoryConfig = TOOL_CATEGORIES[config.category] || {};

    // Add node
    const node = {
      id: name,
      label: name.replace(/_/g, ' '),
      category: config.category,
      color: categoryConfig.color,
      icon: categoryConfig.icon
    };

    if (includeMetadata) {
      node.inputs = config.inputs;
      node.outputs = config.outputs;
      node.effects = config.effects;
      node.description = config.description;
    }

    nodes.push(node);

    // Add edges for dependencies
    for (const dep of (config.dependencies || [])) {
      // Only add edge if dependency is in filtered set
      if (!category || TOOL_GRAPH[dep]?.category === category) {
        edges.push({
          source: dep,
          target: name,
          type: 'dependency'
        });
      }
    }
  }

  if (format === 'nodes-edges') {
    return { nodes, edges, categories: TOOL_CATEGORIES };
  }

  // Adjacency list format
  if (format === 'adjacency') {
    const adjacency = {};
    for (const node of nodes) {
      adjacency[node.id] = {
        ...node,
        dependencies: TOOL_GRAPH[node.id]?.dependencies || [],
        dependents: edges.filter(e => e.source === node.id).map(e => e.target)
      };
    }
    return { adjacency, categories: TOOL_CATEGORIES };
  }

  return { nodes, edges, categories: TOOL_CATEGORIES };
}

/**
 * Detect circular dependencies in the tool graph
 * @returns {{ hasCircular: boolean, cycles: string[][] }}
 */
export function detectCircularDependencies() {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path) {
    if (recursionStack.has(node)) {
      // Found a cycle - extract it from the path
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);

    const deps = TOOL_GRAPH[node]?.dependencies || [];
    for (const dep of deps) {
      if (TOOL_GRAPH[dep]) {
        dfs(dep, [...path, dep]);
      }
    }

    recursionStack.delete(node);
  }

  for (const toolName of Object.keys(TOOL_GRAPH)) {
    if (!visited.has(toolName)) {
      dfs(toolName, [toolName]);
    }
  }

  return {
    hasCircular: cycles.length > 0,
    cycles
  };
}

/**
 * Get tools by category
 * @param {string} category - Category name
 * @returns {Object[]} Tools in that category
 */
export function getToolsByCategory(category) {
  const tools = [];
  for (const [name, config] of Object.entries(TOOL_GRAPH)) {
    if (config.category === category) {
      tools.push({
        name,
        ...config,
        categoryInfo: TOOL_CATEGORIES[category]
      });
    }
  }
  return tools;
}

/**
 * Get impact analysis for a tool
 * Shows what would be affected if this tool fails or is modified
 * @param {string} toolName - Tool to analyze
 * @returns {Object} Impact analysis
 */
export function getToolImpactAnalysis(toolName) {
  const tool = TOOL_GRAPH[toolName];
  if (!tool) {
    return { error: `Unknown tool: ${toolName}` };
  }

  const dependents = getToolDependents(toolName);
  const dependencies = getToolDependencies(toolName);

  // Find affected chains
  const affectedChains = [];
  for (const [chainName, chain] of Object.entries(TOOL_CHAINS)) {
    // Skip dynamic chains that don't have static steps
    if (!chain.steps || chain.dynamic) continue;

    const chainTools = chain.steps.map(s => s.tool);
    if (chainTools.includes(toolName)) {
      affectedChains.push({
        name: chainName,
        displayName: chain.name,
        stepIndex: chainTools.indexOf(toolName),
        totalSteps: chainTools.length,
        isRequired: chain.steps.find(s => s.tool === toolName)?.required ?? true
      });
    }
  }

  return {
    tool: toolName,
    category: tool.category,
    categoryInfo: TOOL_CATEGORIES[tool.category],
    effects: tool.effects,
    inputs: tool.inputs,
    outputs: tool.outputs,
    dependencies,
    dependents,
    affectedChains,
    impactScore: calculateImpactScore(dependents, affectedChains)
  };
}

/**
 * Calculate impact score (0-100)
 * Higher score = more critical tool
 */
function calculateImpactScore(dependents, affectedChains) {
  let score = 0;

  // Direct dependents are highly impactful
  score += dependents.direct.length * 15;

  // Transitive dependents less so
  score += dependents.transitive.length * 5;

  // Affected chains are critical
  score += affectedChains.length * 10;

  // Required steps in chains are more critical
  score += affectedChains.filter(c => c.isRequired).length * 5;

  return Math.min(100, score);
}

/**
 * Validate a chain definition before execution
 * @param {string} chainName - Name of the chain
 * @param {Object} input - Input parameters
 * @returns {{ valid: boolean, errors: string[], chain: Object|null }}
 */
export function validateChain(chainName, input) {
  const errors = [];
  const chain = TOOL_CHAINS[chainName];

  if (!chain) {
    return { valid: false, errors: [`Chain '${chainName}' not found`], chain: null };
  }

  // Get steps (may be dynamic)
  const steps = chain.dynamic && chain.generateSteps 
    ? chain.generateSteps(input) 
    : chain.steps;

  if (!steps || steps.length === 0) {
    errors.push('Chain has no steps to execute');
  }

  // Validate each step's tool exists
  for (const step of steps || []) {
    if (!TOOL_REGISTRY[step.tool]) {
      errors.push(`Step '${step.id}': Tool '${step.tool}' not found in registry`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    chain,
    steps
  };
}

/**
 * Execute a tool chain atomically
 * @param {string} chainName - Name of the chain to execute
 * @param {Object} input - Input parameters for the chain
 * @param {Object} tenantRecord - Tenant record
 * @param {string} userId - User ID
 * @param {Object} accessToken - Security token
 * @param {Object} options - Execution options
 * @returns {Object} Chain execution result with all step results
 */
export async function executeChain(chainName, input, tenantRecord, userId, accessToken, options = {}) {
  const startTime = Date.now();
  const { dryRun = false, stopOnError = true } = options;
  
  // Validate chain
  const validation = validateChain(chainName, input);
  if (!validation.valid) {
    return {
      tag: 'Err',
      error: {
        type: 'ChainValidationError',
        message: validation.errors.join('; '),
        chainName
      }
    };
  }

  const { chain, steps } = validation;
  
  // Role check
  const userRole = accessToken?.user_role || 'user';
  const roleHierarchy = { user: 1, manager: 2, admin: 3, superadmin: 4 };
  const requiredRoleLevel = roleHierarchy[chain.required_role] || 1;
  const userRoleLevel = roleHierarchy[userRole] || 1;
  
  if (userRoleLevel < requiredRoleLevel) {
    return {
      tag: 'Err',
      error: {
        type: 'InsufficientPermissions',
        message: `Chain '${chainName}' requires ${chain.required_role} role or higher`,
        chainName,
        requiredRole: chain.required_role,
        userRole
      }
    };
  }

  // Execute context - accumulates results from each step
  const ctx = {};
  const stepResults = [];
  let hasError = false;

  console.log(`[Braid Chain] Starting '${chainName}' with ${steps.length} steps`, {
    tenantId: tenantRecord?.id,
    userId,
    dryRun
  });

  // Execute each step in sequence
  for (const step of steps) {
    // Check condition
    if (step.condition && !step.condition(ctx)) {
      console.log(`[Braid Chain] Skipping step '${step.id}' - condition not met`);
      stepResults.push({
        id: step.id,
        tool: step.tool,
        skipped: true,
        reason: 'condition_not_met'
      });
      continue;
    }

    // Build arguments using the mapping function
    let args;
    try {
      args = typeof step.args === 'function' ? step.args(input, ctx) : step.args;
    } catch (argErr) {
      console.error(`[Braid Chain] Step '${step.id}' argument mapping failed:`, argErr.message);
      stepResults.push({
        id: step.id,
        tool: step.tool,
        tag: 'Err',
        error: { type: 'ArgumentMappingError', message: argErr.message }
      });
      
      if (step.required && stopOnError) {
        hasError = true;
        break;
      }
      continue;
    }

    // Dry run mode - don't actually execute
    if (dryRun) {
      console.log(`[Braid Chain] DRY RUN step '${step.id}':`, { tool: step.tool, args });
      stepResults.push({
        id: step.id,
        tool: step.tool,
        dryRun: true,
        args
      });
      continue;
    }

    // Execute the tool
    console.log(`[Braid Chain] Executing step '${step.id}': ${step.tool}`);
    const result = await executeBraidTool(step.tool, args, tenantRecord, userId, accessToken);
    
    // Store result in context for subsequent steps
    ctx[step.id] = result;
    
    stepResults.push({
      id: step.id,
      tool: step.tool,
      ...result
    });

    // Check for errors
    if (result.tag === 'Err') {
      console.warn(`[Braid Chain] Step '${step.id}' failed:`, result.error);
      
      if (step.required && stopOnError) {
        hasError = true;
        break;
      }
    }
  }

  // Rollback if there was an error and rollback steps are defined
  if (hasError && chain.rollback && !dryRun) {
    console.log(`[Braid Chain] Initiating rollback for '${chainName}'`);
    const rollbackResults = [];
    
    for (const rollbackStep of chain.rollback) {
      // Check rollback condition
      if (rollbackStep.condition && !rollbackStep.condition(ctx)) {
        continue;
      }

      try {
        const rollbackArgs = typeof rollbackStep.args === 'function' 
          ? rollbackStep.args(ctx) 
          : rollbackStep.args;
        
        if (!rollbackArgs) continue; // Skip if no valid args

        console.log(`[Braid Chain] Rollback: ${rollbackStep.tool}`, rollbackArgs);
        const rollbackResult = await executeBraidTool(
          rollbackStep.tool, 
          rollbackArgs, 
          tenantRecord, 
          userId, 
          accessToken
        );
        rollbackResults.push({ tool: rollbackStep.tool, ...rollbackResult });
      } catch (rollbackErr) {
        console.error(`[Braid Chain] Rollback step failed:`, rollbackErr.message);
        rollbackResults.push({ tool: rollbackStep.tool, tag: 'Err', error: { message: rollbackErr.message } });
      }
    }

    return {
      tag: 'Err',
      error: {
        type: 'ChainExecutionError',
        message: `Chain '${chainName}' failed and was rolled back`,
        chainName
      },
      steps: stepResults,
      rollback: rollbackResults,
      executionTimeMs: Date.now() - startTime
    };
  }

  const executionTimeMs = Date.now() - startTime;
  console.log(`[Braid Chain] Completed '${chainName}' in ${executionTimeMs}ms`, {
    hasError,
    stepsCompleted: stepResults.filter(s => !s.skipped && !s.dryRun).length
  });

  return {
    tag: hasError ? 'Err' : 'Ok',
    value: {
      chainName,
      steps: stepResults,
      context: ctx, // Final context with all results
      dryRun
    },
    executionTimeMs
  };
}

/**
 * List available chains with their metadata
 * @param {string} userRole - User's role for filtering
 * @returns {Object[]} Array of chain metadata
 */
export function listChains(userRole = 'user') {
  const roleHierarchy = { user: 1, manager: 2, admin: 3, superadmin: 4 };
  const userRoleLevel = roleHierarchy[userRole] || 1;

  return Object.entries(TOOL_CHAINS)
    .filter(([_, chain]) => {
      const requiredLevel = roleHierarchy[chain.required_role] || 1;
      return userRoleLevel >= requiredLevel;
    })
    .map(([name, chain]) => ({
      name,
      displayName: chain.name,
      description: chain.description,
      requiredRole: chain.required_role,
      policy: chain.policy,
      dynamic: chain.dynamic || false,
      stepCount: chain.dynamic ? 'variable' : chain.steps?.length || 0
    }));
}

/**
 * Parameter order for each Braid function (matches .braid file signatures)
 */
const BRAID_PARAM_ORDER = {
  // Snapshot
  fetchSnapshot: ['tenant', 'scope', 'limit'],
  probe: ['tenant'],

  // Accounts
  createAccount: ['tenant', 'name', 'annual_revenue', 'industry', 'website', 'email', 'phone'],
  updateAccount: ['tenant', 'account_id', 'updates'],
  getAccountDetails: ['tenant', 'account_id'],
  listAccounts: ['tenant', 'limit'],
  searchAccounts: ['tenant', 'query', 'limit'],
  deleteAccount: ['tenant', 'account_id'],

  // Leads
  createLead: ['tenant', 'first_name', 'last_name', 'email', 'company', 'phone', 'source'],
  updateLead: ['tenant', 'lead_id', 'updates'],
  qualifyLead: ['tenant', 'lead_id', 'notes'],
  convertLeadToAccount: ['tenant', 'lead_id', 'options'],
  listLeads: ['tenant', 'status', 'account_id', 'limit'],
  searchLeads: ['tenant', 'query', 'limit'],
  getLeadDetails: ['tenant', 'lead_id'],
  deleteLead: ['tenant', 'lead_id'],

  // Activities
  createActivity: ['tenant', 'subject', 'activity_type', 'due_date', 'assigned_to', 'related_to_type', 'related_to_id', 'body'],
  updateActivity: ['tenant', 'activity_id', 'updates'],
  markActivityComplete: ['tenant', 'activity_id'],
  getUpcomingActivities: ['tenant', 'assigned_to', 'days'],
  listActivities: ['tenant', 'status', 'related_to_type', 'related_to_id', 'limit'],
  searchActivities: ['tenant', 'query', 'limit'],
  getActivityDetails: ['tenant', 'activity_id'],
  scheduleMeeting: ['tenant', 'subject', 'attendees', 'date_time', 'duration_minutes', 'assigned_to'],
  deleteActivity: ['tenant', 'activity_id'],


  // Notes
  createNote: ['tenant', 'content', 'related_to', 'related_id'],
  updateNote: ['tenant', 'note_id', 'content'],
  searchNotes: ['tenant', 'query', 'limit'],
  getNotesForRecord: ['tenant', 'related_to', 'related_id'],
  getNoteDetails: ['tenant', 'note_id'],
  deleteNote: ['tenant', 'note_id'],

  // Opportunities
  createOpportunity: ['tenant', 'name', 'description', 'amount', 'stage', 'probability', 'close_date', 'account_id', 'contact_id'],
  updateOpportunity: ['tenant', 'opportunity_id', 'updates'],
  listOpportunitiesByStage: ['tenant', 'stage', 'account_id', 'limit'],
  searchOpportunities: ['tenant', 'query', 'limit'],
  getOpportunityDetails: ['tenant', 'opportunity_id'],
  getOpportunityForecast: ['tenant', 'period'],
  markOpportunityWon: ['tenant', 'opportunity_id', 'close_details'],
  deleteOpportunity: ['tenant', 'opportunity_id'],

  // Contacts
  createContact: ['tenant', 'first_name', 'last_name', 'email', 'phone', 'job_title', 'account_id'],
  updateContact: ['tenant', 'contact_id', 'updates'],
  listContactsForAccount: ['tenant', 'account_id', 'limit'],
  getContactDetails: ['tenant', 'contact_id'],
  searchContacts: ['tenant', 'query', 'limit'],
  deleteContact: ['tenant', 'contact_id'],

  // Web Research
  searchWeb: ['query', 'limit'],
  fetchWebPage: ['url'],
  lookupCompanyInfo: ['company_name'],

  // BizDev Sources (v3.0.0 workflow)
  createBizDevSource: ['tenant', 'source_name', 'source_type', 'company_name', 'contact_name', 'email', 'phone', 'priority'],
  updateBizDevSource: ['tenant', 'source_id', 'updates'],
  getBizDevSourceDetails: ['tenant', 'source_id'],
  listBizDevSources: ['tenant', 'status', 'priority', 'limit'],
  searchBizDevSources: ['tenant', 'query', 'source_type', 'limit'],
  promoteBizDevSourceToLead: ['tenant', 'source_id', 'options'],
  deleteBizDevSource: ['tenant', 'source_id'],
  archiveBizDevSources: ['tenant', 'source_ids'],

  // v3.0.0 Lifecycle Orchestration
  advanceToLead: ['tenant', 'bizdev_source_id', 'notes'],
  advanceToQualified: ['tenant', 'lead_id', 'qualification_notes'],
  advanceToAccount: ['tenant', 'lead_id', 'create_account', 'account_name', 'selected_account_id', 'create_opportunity', 'opportunity_name', 'opportunity_amount'],
  advanceOpportunityStage: ['tenant', 'opportunity_id', 'new_stage', 'notes'],
  fullLifecycleAdvance: ['tenant', 'bizdev_source_id', 'qualification_notes', 'create_account', 'account_name', 'create_opportunity', 'opportunity_name', 'opportunity_amount'],

  // AI Suggestions (Phase 3 Autonomous Operations)
  listSuggestions: ['tenant', 'status', 'limit'],
  getSuggestionDetails: ['tenant', 'suggestion_id'],
  getSuggestionStats: ['tenant'],
  approveSuggestion: ['tenant', 'suggestion_id', 'reviewer_notes'],
  rejectSuggestion: ['tenant', 'suggestion_id', 'rejection_reason'],
  applySuggestion: ['tenant', 'suggestion_id'],
  triggerSuggestionGeneration: ['tenant', 'trigger_id'],
  
  // AI Next Actions (RAG-enabled suggestions)
  suggestNextActions: ['tenant', 'entity_type', 'entity_id', 'limit'],

  // CRM Navigation (v3.0.0)
  navigateTo: ['tenant', 'page', 'record_id'],
  getCurrentPage: ['tenant']
};

/**
 * Convert object args to positional array based on Braid function signature
 */
function objectToPositionalArgs(toolName, argsObj) {
  const config = TOOL_REGISTRY[toolName];
  if (!config) return [argsObj]; // fallback to object if unknown

  const funcName = config.function;
  const paramOrder = BRAID_PARAM_ORDER[funcName];

  if (!paramOrder) {
    console.warn(`[Braid] No param order defined for ${funcName}, passing as object`);
    return [argsObj];
  }

  // Extract values in order, using undefined for missing params
  return paramOrder.map(param => argsObj[param]);
}

function normalizeToolArgs(toolName, rawArgs, tenantRecord) {
  // Use UUID for API calls, not the text slug
  const tenantUuid = tenantRecord?.id || null;
  const args = rawArgs && typeof rawArgs === 'object' ? { ...rawArgs } : {};

  // CRITICAL: Always inject the tenant from the authorized context
  // This ensures ALL operations (create, update, delete, list) use the correct tenant
  // The AI model should NOT be trusted to pass the tenant - we enforce it server-side
  const currentTenant = args.tenant || args.tenant_id || null;
  if (!currentTenant || currentTenant === 'default') {
    args.tenant = tenantUuid;
  } else if (currentTenant !== tenantUuid) {
    // Security: If AI passed a different tenant, override it with the authorized one
    console.warn('[Braid Security] Overriding AI-provided tenant with authorized context', {
      toolName,
      providedTenant: currentTenant,
      authorizedTenant: tenantUuid
    });
    args.tenant = tenantUuid;
  }

  // Unwrap common filter pattern for listing tools
  if (args.filter && typeof args.filter === 'object') {
    const filterTools = new Set([
      'list_leads',
      'list_opportunities_by_stage',
      'list_accounts',
      'search_contacts',
    ]);

    if (filterTools.has(toolName)) {
      Object.assign(args, args.filter);
      delete args.filter;
    }
  }

  // Normalize common scalar fields
  if (typeof args.limit === 'string') {
    const n = parseInt(args.limit, 10);
    if (!Number.isNaN(n)) args.limit = n;
  }
  
  // Normalize status: "all" means no filter (undefined)
  if (args.status === 'all' || args.status === 'any' || args.status === '') {
    args.status = undefined;
  }

  // For update tools, inject tenant_id into the updates object
  // The v2 API requires tenant_id in the request body for updates
  const updateTools = new Set([
    'update_activity',
    'update_lead',
    'update_account',
    'update_contact',
    'update_opportunity',
    'update_note',
    'update_bizdev_source'
  ]);

  if (updateTools.has(toolName) && args.updates) {
    // Parse updates if LLM passed it as a JSON string
    if (typeof args.updates === 'string') {
      try {
        args.updates = JSON.parse(args.updates);
      } catch (_e) {
        console.warn('[Braid] Failed to parse updates string:', args.updates);
      }
    }

    if (typeof args.updates === 'object' && args.updates !== null) {
      args.updates = {
        ...args.updates,
        tenant_id: tenantUuid
      };
    }
  }

  return args;
}
