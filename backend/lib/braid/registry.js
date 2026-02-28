/**
 * Braid Registry Module
 * Tool registry, descriptions, and system prompt management for Braid tools
 */

import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { loadToolSchema } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.join(__dirname, '..', '..', '..', 'braid-llm-kit', 'examples', 'assistant');

// Cache TTLs for different tool types (in seconds)
export const TOOL_CACHE_TTL = {
  fetch_tenant_snapshot: 60, // 1 minute - high-value, frequently accessed
  list_leads: 120, // 2 minutes - list operations
  list_accounts: 120,
  list_opportunities_by_stage: 120,
  list_activities: 120,
  list_contacts_for_account: 120,
  list_bizdev_sources: 120,
  get_upcoming_activities: 60, // 1 minute - time-sensitive
  search_leads: 60, // 1 minute - search results
  search_accounts: 60,
  search_contacts: 60,
  get_contact_by_name: 60, // 1 minute - name search
  search_opportunities: 60,
  search_activities: 60,
  search_documents: 60,
  search_employees: 60,
  search_users: 60,
  get_lead_details: 180, // 3 minutes - detail views
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
  // get_revenue_forecasts: 300, // revenues.braid not yet implemented
  get_employee_assignments: 180,
  get_current_page: 10, // 10 seconds - navigation context
  list_documents: 120,
  list_employees: 120,
  list_users: 120,
  get_current_user_profile: 300,
  get_user_profiles: 300,
  DEFAULT: 90, // 1.5 minutes default
};

/**
 * Generate a cache key for a Braid tool execution
 * @param {string} toolName - Name of the tool
 * @param {string} tenantId - Tenant UUID
 * @param {Object} args - Tool arguments (normalized)
 * @returns {string} Cache key
 */
export function generateBraidCacheKey(toolName, tenantId, args) {
  // Create a hash of the args to keep key length manageable
  const argsHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(args))
    .digest('hex')
    .substring(0, 12);

  return `braid:${tenantId}:${toolName}:${argsHash}`;
}

/**
 * Tool Registry - Maps tool names to Braid files
 */
export const TOOL_REGISTRY = {
  // Accounts
  create_account: { file: 'accounts.braid', function: 'createAccount', policy: 'WRITE_OPERATIONS' },
  update_account: { file: 'accounts.braid', function: 'updateAccount', policy: 'WRITE_OPERATIONS' },
  get_account_details: {
    file: 'accounts.braid',
    function: 'getAccountDetails',
    policy: 'READ_ONLY',
  },
  list_accounts: { file: 'accounts.braid', function: 'listAccounts', policy: 'READ_ONLY' },
  search_accounts: { file: 'accounts.braid', function: 'searchAccounts', policy: 'READ_ONLY' },
  search_accounts_by_status: {
    file: 'accounts.braid',
    function: 'searchAccountsByStatus',
    policy: 'READ_ONLY',
  },
  delete_account: { file: 'accounts.braid', function: 'deleteAccount', policy: 'WRITE_OPERATIONS' },

  // Activities
  create_activity: {
    file: 'activities.braid',
    function: 'createActivity',
    policy: 'WRITE_OPERATIONS',
  },
  update_activity: {
    file: 'activities.braid',
    function: 'updateActivity',
    policy: 'WRITE_OPERATIONS',
  },
  mark_activity_complete: {
    file: 'activities.braid',
    function: 'markActivityComplete',
    policy: 'WRITE_OPERATIONS',
  },
  get_upcoming_activities: {
    file: 'activities.braid',
    function: 'getUpcomingActivities',
    policy: 'READ_ONLY',
  },
  schedule_meeting: {
    file: 'activities.braid',
    function: 'scheduleMeeting',
    policy: 'WRITE_OPERATIONS',
  },
  delete_activity: {
    file: 'activities.braid',
    function: 'deleteActivity',
    policy: 'WRITE_OPERATIONS',
  },
  list_activities: { file: 'activities.braid', function: 'listActivities', policy: 'READ_ONLY' },
  get_activity_details: {
    file: 'activities.braid',
    function: 'getActivityDetails',
    policy: 'READ_ONLY',
  },
  search_activities: {
    file: 'activities.braid',
    function: 'searchActivities',
    policy: 'READ_ONLY',
  },

  // Bizdev Sources
  create_bizdev_source: {
    file: 'bizdev-sources.braid',
    function: 'createBizDevSource',
    policy: 'WRITE_OPERATIONS',
  },
  update_bizdev_source: {
    file: 'bizdev-sources.braid',
    function: 'updateBizDevSource',
    policy: 'WRITE_OPERATIONS',
  },
  get_bizdev_source_details: {
    file: 'bizdev-sources.braid',
    function: 'getBizDevSourceDetails',
    policy: 'READ_ONLY',
  },
  list_bizdev_sources: {
    file: 'bizdev-sources.braid',
    function: 'listBizDevSources',
    policy: 'READ_ONLY',
  },
  search_bizdev_sources: {
    file: 'bizdev-sources.braid',
    function: 'searchBizDevSources',
    policy: 'READ_ONLY',
  },
  promote_bizdev_source_to_lead: {
    file: 'bizdev-sources.braid',
    function: 'promoteBizDevSourceToLead',
    policy: 'WRITE_OPERATIONS',
  },
  delete_bizdev_source: {
    file: 'bizdev-sources.braid',
    function: 'deleteBizDevSource',
    policy: 'WRITE_OPERATIONS',
  },
  archive_bizdev_sources: {
    file: 'bizdev-sources.braid',
    function: 'archiveBizDevSources',
    policy: 'WRITE_OPERATIONS',
  },

  // Contacts
  create_contact: { file: 'contacts.braid', function: 'createContact', policy: 'WRITE_OPERATIONS' },
  update_contact: { file: 'contacts.braid', function: 'updateContact', policy: 'WRITE_OPERATIONS' },
  list_contacts_for_account: {
    file: 'contacts.braid',
    function: 'listContactsForAccount',
    policy: 'READ_ONLY',
  },
  search_contacts: { file: 'contacts.braid', function: 'searchContacts', policy: 'READ_ONLY' },
  get_contact_by_name: {
    file: 'contacts.braid',
    function: 'getContactByName',
    policy: 'READ_ONLY',
  },
  list_all_contacts: { file: 'contacts.braid', function: 'listAllContacts', policy: 'READ_ONLY' },
  search_contacts_by_status: {
    file: 'contacts.braid',
    function: 'searchContactsByStatus',
    policy: 'READ_ONLY',
  },
  delete_contact: { file: 'contacts.braid', function: 'deleteContact', policy: 'WRITE_OPERATIONS' },
  get_contact_details: {
    file: 'contacts.braid',
    function: 'getContactDetails',
    policy: 'READ_ONLY',
  },

  // Documents
  list_documents: { file: 'documents.braid', function: 'listDocuments', policy: 'READ_ONLY' },
  get_document_details: {
    file: 'documents.braid',
    function: 'getDocumentDetails',
    policy: 'READ_ONLY',
  },
  create_document: {
    file: 'documents.braid',
    function: 'createDocument',
    policy: 'WRITE_OPERATIONS',
  },
  update_document: {
    file: 'documents.braid',
    function: 'updateDocument',
    policy: 'WRITE_OPERATIONS',
  },
  delete_document: {
    file: 'documents.braid',
    function: 'deleteDocument',
    policy: 'WRITE_OPERATIONS',
  },
  analyze_document: { file: 'documents.braid', function: 'analyzeDocument', policy: 'READ_ONLY' },
  search_documents: { file: 'documents.braid', function: 'searchDocuments', policy: 'READ_ONLY' },

  // Employees
  list_employees: { file: 'employees.braid', function: 'listEmployees', policy: 'READ_ONLY' },
  get_employee_details: {
    file: 'employees.braid',
    function: 'getEmployeeDetails',
    policy: 'READ_ONLY',
  },
  create_employee: {
    file: 'employees.braid',
    function: 'createEmployee',
    policy: 'WRITE_OPERATIONS',
  },
  update_employee: {
    file: 'employees.braid',
    function: 'updateEmployee',
    policy: 'WRITE_OPERATIONS',
  },
  delete_employee: {
    file: 'employees.braid',
    function: 'deleteEmployee',
    policy: 'WRITE_OPERATIONS',
  },
  search_employees: { file: 'employees.braid', function: 'searchEmployees', policy: 'READ_ONLY' },
  get_employee_assignments: {
    file: 'employees.braid',
    function: 'getEmployeeAssignments',
    policy: 'READ_ONLY',
  },

  // Leads
  create_lead: { file: 'leads.braid', function: 'createLead', policy: 'WRITE_OPERATIONS' },
  delete_lead: { file: 'leads.braid', function: 'deleteLead', policy: 'WRITE_OPERATIONS' },
  qualify_lead: { file: 'leads.braid', function: 'qualifyLead', policy: 'WRITE_OPERATIONS' },
  update_lead: { file: 'leads.braid', function: 'updateLead', policy: 'WRITE_OPERATIONS' },
  convert_lead_to_account: {
    file: 'leads.braid',
    function: 'convertLeadToAccount',
    policy: 'WRITE_OPERATIONS',
  },
  list_leads: { file: 'leads.braid', function: 'listLeads', policy: 'READ_ONLY' },
  get_lead_details: { file: 'leads.braid', function: 'getLeadDetails', policy: 'READ_ONLY' },
  search_leads: { file: 'leads.braid', function: 'searchLeads', policy: 'READ_ONLY' },
  search_leads_by_status: {
    file: 'leads.braid',
    function: 'searchLeadsByStatus',
    policy: 'READ_ONLY',
  },

  // Lifecycle
  advance_to_lead: {
    file: 'lifecycle.braid',
    function: 'advanceToLead',
    policy: 'WRITE_OPERATIONS',
  },
  advance_to_qualified: {
    file: 'lifecycle.braid',
    function: 'advanceToQualified',
    policy: 'WRITE_OPERATIONS',
  },
  advance_to_account: {
    file: 'lifecycle.braid',
    function: 'advanceToAccount',
    policy: 'WRITE_OPERATIONS',
  },
  advance_opportunity_stage: {
    file: 'lifecycle.braid',
    function: 'advanceOpportunityStage',
    policy: 'WRITE_OPERATIONS',
  },
  full_lifecycle_advance: {
    file: 'lifecycle.braid',
    function: 'fullLifecycleAdvance',
    policy: 'READ_ONLY',
  },

  // Navigation
  navigate_to_page: { file: 'navigation.braid', function: 'navigateTo', policy: 'READ_ONLY' },
  get_current_page: { file: 'navigation.braid', function: 'getCurrentPage', policy: 'READ_ONLY' },

  // Notes
  create_note: { file: 'notes.braid', function: 'createNote', policy: 'WRITE_OPERATIONS' },
  update_note: { file: 'notes.braid', function: 'updateNote', policy: 'WRITE_OPERATIONS' },
  search_notes: { file: 'notes.braid', function: 'searchNotes', policy: 'READ_ONLY' },
  get_notes_for_record: { file: 'notes.braid', function: 'getNotesForRecord', policy: 'READ_ONLY' },
  get_note_details: { file: 'notes.braid', function: 'getNoteDetails', policy: 'READ_ONLY' },
  delete_note: { file: 'notes.braid', function: 'deleteNote', policy: 'WRITE_OPERATIONS' },

  // Opportunities
  create_opportunity: {
    file: 'opportunities.braid',
    function: 'createOpportunity',
    policy: 'WRITE_OPERATIONS',
  },
  delete_opportunity: {
    file: 'opportunities.braid',
    function: 'deleteOpportunity',
    policy: 'WRITE_OPERATIONS',
  },
  update_opportunity: {
    file: 'opportunities.braid',
    function: 'updateOpportunity',
    policy: 'WRITE_OPERATIONS',
  },
  list_opportunities_by_stage: {
    file: 'opportunities.braid',
    function: 'listOpportunitiesByStage',
    policy: 'READ_ONLY',
  },
  get_opportunity_details: {
    file: 'opportunities.braid',
    function: 'getOpportunityDetails',
    policy: 'READ_ONLY',
  },
  search_opportunities: {
    file: 'opportunities.braid',
    function: 'searchOpportunities',
    policy: 'READ_ONLY',
  },
  search_opportunities_by_stage: {
    file: 'opportunities.braid',
    function: 'searchOpportunitiesByStage',
    policy: 'READ_ONLY',
  },
  get_opportunity_forecast: {
    file: 'opportunities.braid',
    function: 'getOpportunityForecast',
    policy: 'READ_ONLY',
  },
  mark_opportunity_won: {
    file: 'opportunities.braid',
    function: 'markOpportunityWon',
    policy: 'WRITE_OPERATIONS',
  },

  // Reports
  get_dashboard_bundle: {
    file: 'reports.braid',
    function: 'getDashboardBundle',
    policy: 'READ_ONLY',
  },
  get_health_summary: { file: 'reports.braid', function: 'getHealthSummary', policy: 'READ_ONLY' },
  get_sales_report: { file: 'reports.braid', function: 'getSalesReport', policy: 'READ_ONLY' },
  get_pipeline_report: {
    file: 'reports.braid',
    function: 'getPipelineReport',
    policy: 'READ_ONLY',
  },
  get_activity_report: {
    file: 'reports.braid',
    function: 'getActivityReport',
    policy: 'READ_ONLY',
  },
  get_lead_conversion_report: {
    file: 'reports.braid',
    function: 'getLeadConversionReport',
    policy: 'READ_ONLY',
  },
  // get_revenue_forecasts: { file: 'revenues.braid', function: 'getRevenueForecasts', policy: 'READ_ONLY' },
  // TODO: revenues.braid not yet implemented — re-enable when created [2026-02-24 Claude]
  clear_report_cache: { file: 'reports.braid', function: 'clearReportCache', policy: 'READ_ONLY' },

  // Snapshot
  fetch_tenant_snapshot: { file: 'snapshot.braid', function: 'fetchSnapshot', policy: 'READ_ONLY' },
  debug_probe: { file: 'snapshot.braid', function: 'probe', policy: 'READ_ONLY' },

  // Suggest Next Actions
  suggest_next_actions: {
    file: 'suggest-next-actions.braid',
    function: 'suggestNextActions',
    policy: 'READ_ONLY',
  },

  // Suggestions
  list_suggestions: { file: 'suggestions.braid', function: 'listSuggestions', policy: 'READ_ONLY' },
  get_suggestion_details: {
    file: 'suggestions.braid',
    function: 'getSuggestionDetails',
    policy: 'READ_ONLY',
  },
  get_suggestion_stats: {
    file: 'suggestions.braid',
    function: 'getSuggestionStats',
    policy: 'READ_ONLY',
  },
  approve_suggestion: {
    file: 'suggestions.braid',
    function: 'approveSuggestion',
    policy: 'WRITE_OPERATIONS',
  },
  reject_suggestion: {
    file: 'suggestions.braid',
    function: 'rejectSuggestion',
    policy: 'WRITE_OPERATIONS',
  },
  apply_suggestion: {
    file: 'suggestions.braid',
    function: 'applySuggestion',
    policy: 'WRITE_OPERATIONS',
  },
  trigger_suggestion_generation: {
    file: 'suggestions.braid',
    function: 'triggerSuggestionGeneration',
    policy: 'WRITE_OPERATIONS',
  },

  // Telephony
  initiate_call: { file: 'telephony.braid', function: 'initiateCall', policy: 'READ_ONLY' },
  call_contact: { file: 'telephony.braid', function: 'callContact', policy: 'READ_ONLY' },
  check_calling_provider: {
    file: 'telephony.braid',
    function: 'checkCallingProvider',
    policy: 'READ_ONLY',
  },
  get_calling_agents: {
    file: 'telephony.braid',
    function: 'getCallingAgents',
    policy: 'READ_ONLY',
  },

  // Users
  list_users: { file: 'users.braid', function: 'listUsers', policy: 'READ_ONLY' },
  get_user_details: { file: 'users.braid', function: 'getUserDetails', policy: 'READ_ONLY' },
  get_current_user_profile: {
    file: 'users.braid',
    function: 'getCurrentUserProfile',
    policy: 'READ_ONLY',
  },
  get_user_profiles: { file: 'users.braid', function: 'getUserProfiles', policy: 'READ_ONLY' },
  create_user: { file: 'users.braid', function: 'createUser', policy: 'WRITE_OPERATIONS' },
  update_user: { file: 'users.braid', function: 'updateUser', policy: 'WRITE_OPERATIONS' },
  delete_user: { file: 'users.braid', function: 'deleteUser', policy: 'WRITE_OPERATIONS' },
  search_users: { file: 'users.braid', function: 'searchUsers', policy: 'READ_ONLY' },
  invite_user: { file: 'users.braid', function: 'inviteUser', policy: 'READ_ONLY' },

  // Web Research
  search_web: { file: 'web-research.braid', function: 'searchWeb', policy: 'READ_ONLY' },
  fetch_web_page: { file: 'web-research.braid', function: 'fetchWebPage', policy: 'READ_ONLY' },
  lookup_company_info: {
    file: 'web-research.braid',
    function: 'lookupCompanyInfo',
    policy: 'READ_ONLY',
  },

  // Workflow Delegation
  trigger_workflow_by_name: {
    file: 'workflow-delegation.braid',
    function: 'triggerWorkflowByName',
    policy: 'WRITE_OPERATIONS',
  },
  get_workflow_progress: {
    file: 'workflow-delegation.braid',
    function: 'getWorkflowProgress',
    policy: 'READ_ONLY',
  },
  list_active_workflows: {
    file: 'workflow-delegation.braid',
    function: 'listActiveWorkflows',
    policy: 'READ_ONLY',
  },
  get_workflow_notes: {
    file: 'workflow-delegation.braid',
    function: 'getWorkflowNotes',
    policy: 'READ_ONLY',
  },

  // Workflows
  list_workflow_templates: {
    file: 'workflows.braid',
    function: 'listWorkflowTemplates',
    policy: 'READ_ONLY',
  },
  get_workflow_template: {
    file: 'workflows.braid',
    function: 'getWorkflowTemplate',
    policy: 'READ_ONLY',
  },
  instantiate_workflow_template: {
    file: 'workflows.braid',
    function: 'instantiateWorkflowTemplate',
    policy: 'READ_ONLY',
  },
};

/**
 * Parameter descriptions for tools to guide LLM on correct field usage
 * Prevents field scrambling by providing semantic meaning to each parameter
 */
export const PARAMETER_DESCRIPTIONS = {
  create_lead: {
    tenant: 'Tenant UUID (automatically provided by system)',
    first_name:
      'PERSON\'S first/given name only - NOT a phone number, NOT a company! Example: "Josh" from "Josh Johnson"',
    last_name:
      'PERSON\'S last/family name only - NOT a phone number, NOT a company! Example: "Johnson" from "Josh Johnson")',
    email:
      'Email address in format user@domain.com - MUST contain @ symbol. Example: "josh@company.com" NOT a phone number or company name!',
    company:
      'COMPANY/ORGANIZATION NAME - NOT a phone number! Should be a business name like "TechStart Solutions", "ABC Liquor", "MarcusLabs". If you see digits like "3526599887", that is a PHONE NUMBER not a company!',
    phone:
      'PHONE NUMBER ONLY - digits/numbers like "555-1234" or "3526599887" or "(415) 555-0199". If you see text like "MarcusLabs" or "TechStart", that is a COMPANY NAME not a phone number!',
    source:
      'How they found us: Website, Referral, Cold Call, LinkedIn, Trade Show, Manual Entry, etc.',
  },
  update_lead: {
    tenant: 'Tenant UUID (automatically provided by system)',
    lead_id: 'UUID of the lead to update (from previous search or get_lead_details)',
    updates: 'Object with fields to update (e.g., {first_name: "Josh", company: "TechStart"})',
  },
};

/**
 * Human-readable descriptions for each tool
 * These are exposed to the AI to help it understand when to use each tool
 */
export const TOOL_DESCRIPTIONS = {
  // Snapshot
  fetch_tenant_snapshot:
    'Get a high-level summary of all CRM data: counts of accounts, leads, contacts, opportunities, activities, and aggregate revenue/forecast. Use this first to understand the overall state.',

  // Accounts
  create_account: 'Create a new Account (company/organization) record in the CRM.',
  update_account:
    'Update an existing Account record by its ID. Can modify name, revenue, industry, website, email, phone, etc.',
  get_account_details:
    'Get the full details of a specific Account by its ID. Returns all fields including name, annual_revenue, industry, website, email, phone, assigned_to, and metadata.',
  list_accounts:
    'List Accounts in the CRM. IMPORTANT: If more than 5 results, summarize the count and tell user to check the Accounts page in the UI for the full list. Use industry filter to narrow results.',
  search_accounts:
    'Search for Accounts by name, industry, or website. Use this when the user mentions an account by name (e.g., "Acme Corp") to find matching account records.',

  // Leads
  create_lead: 'Create a new Lead (potential prospect) record in the CRM.',
  update_lead:
    'Update an existing Lead record by its ID. Can modify name, email, company, status, source, phone, job_title, etc. Use for status changes (new→contacted→qualified).',
  qualify_lead:
    'Mark a Lead as qualified. Updates status to "qualified" and prepares it for conversion. Use before convert_lead_to_account.',
  convert_lead_to_account:
    'v3.0.0 WORKFLOW: Convert a Lead to Contact + Account + Opportunity. This is the key transition that creates the full customer record. Options: create_account (bool), account_name (string), selected_account_id (UUID for existing account), create_opportunity (bool), opportunity_name, opportunity_amount. Returns contact, account, opportunity.',
  list_leads:
    '⚠️ NOT FOR COUNTING! Use get_dashboard_bundle for counts. This tool lists individual Lead records. Use ONLY when user wants to SEE the leads, not count them. Pass status filter or "all". Pass assigned_to with a user UUID to filter by owner — when user says "my leads", pass their User ID from CURRENT USER IDENTITY. Pass assigned_to="unassigned" for unowned leads.',
  search_leads:
    'Search for Leads by name, email, or company text. ALWAYS use this first when user asks about a lead by name or wants lead details. Use get_lead_details only when you have the lead_id. ⚠️ NOT for filtering by assignment — use list_leads with assigned_to param instead when user asks "my leads" or "leads assigned to me".',
  get_lead_details:
    'Get the full details of a specific Lead by its UUID. Only use when you already have the lead_id from a previous search or list.',

  // Activities
  create_activity:
    'Create a new Activity (task, meeting, call, email). REQUIRED: subject (title), activity_type, due_date (ISO format WITH user timezone offset from system prompt), entity_type, entity_id. OPTIONAL: assigned_to, body. DATE RULES: 1) Use due_date for when - NEVER in subject or body. 2) NEVER past dates. 3) "today" = 5:00 PM today. 4) "tomorrow" = 9:00 AM tomorrow. 5) Default = tomorrow 9:00 AM. 6) ALWAYS use the timezone offset from system prompt, IGNORE any timezone user mentions.',
  update_activity:
    'Update/reschedule an existing Activity by its ID. Pass activity_id and updates object with new due_date (ISO format with user timezone offset from system prompt). Put dates in due_date field only. NEVER set dates in the past. ALWAYS use the timezone offset from system prompt.',
  mark_activity_complete:
    'Mark an Activity as completed by its ID. Use the ID from previous list/search results.',
  get_upcoming_activities:
    'Get upcoming activities for a user. The assigned_to parameter must be a user UUID (not email). Use search_users first to find the user UUID if needed. Use list_activities for general calendar queries.',
  schedule_meeting:
    'Schedule a new meeting with attendees. Creates a meeting-type activity with date, time, duration, and attendee list. ALWAYS use the timezone offset from system prompt in date_time.',
  list_activities:
    'List all Activities in the CRM. Use this for calendar/schedule queries. Pass status="planned" for upcoming/pending, status="overdue" for overdue, status="completed" for past, or status="all" for everything. IMPORTANT: Results include activity IDs - remember these for follow-up actions like update or complete.',
  search_activities:
    'Search for Activities by subject, body, or type. ALWAYS use this first when user asks about an activity by name or keyword. Results include IDs for follow-up actions.',
  get_activity_details:
    'Get the full details of a specific Activity by its UUID. Only use when you already have the activity_id from a previous list or search.',
  delete_activity:
    'Delete an Activity by its ID. Use with caution - this permanently removes the activity.',

  // Notes
  create_note:
    'Create a new Note attached to a CRM record. USE THIS when user says "create a note", "add a note", "make a note". REQUIRED parameters in order: title (short subject line), content (the full note text body), entity_type (one of: "lead", "account", "contact", "opportunity"), entity_id (the UUID of the record to attach note to), note_type (one of: "general", "call_log", "meeting", "email", "task", "follow_up", "important", "demo", "proposal"). Choose note_type based on context.',
  update_note: 'Update an existing Note by its ID.',
  search_notes: 'Search notes by keyword across all records.',
  get_notes_for_record:
    'Get all notes attached to a specific record. REQUIRED: entity_type (one of: "lead", "account", "contact", "opportunity"), entity_id (the UUID of the record).',
  get_note_details: 'Get the full details of a specific Note by its ID.',

  // Opportunities
  create_opportunity: 'Create a new Opportunity (deal/sale) in the CRM.',
  update_opportunity:
    'Update an existing Opportunity by its ID. Can modify name, amount, stage, probability, close_date, etc.',
  list_opportunities_by_stage:
    'List Opportunities filtered by stage. FIRST ask user: "Which stage would you like? Options: prospecting, qualification, proposal, negotiation, closed_won, closed_lost, or all?" IMPORTANT: If more than 5 results, summarize the count and tell user to check the Opportunities page in the UI.',
  search_opportunities:
    'Search for Opportunities by name or description. Use this when the user mentions an opportunity/deal by name (e.g., "Enterprise License Deal") to find matching opportunities.',
  get_opportunity_details:
    'Get the full details of a specific Opportunity by its ID. Returns name, description, amount, stage, probability, close_date, account_id, contact_id.',
  get_opportunity_forecast: 'Get a probability-weighted revenue forecast for all opportunities.',
  mark_opportunity_won: 'Mark an Opportunity as won (closed successfully).',

  // Contacts
  create_contact: 'Create a new Contact (individual person) associated with an Account.',
  update_contact: 'Update an existing Contact by its ID.',
  list_contacts_for_account:
    'List all Contacts belonging to a specific Account. IMPORTANT: If more than 5 results, summarize the count and tell user to check the Contacts page in the UI for the full list.',
  get_contact_details:
    'Get the full details of a specific Contact by its ID. Returns first_name, last_name, email, phone, job_title, account_id.',
  get_contact_by_name:
    'Search for and retrieve a specific Contact by their name. USE THIS when user asks for contact details by name. Returns full contact info including first_name, last_name, email, phone, mobile, job_title, address.',
  search_contacts:
    'Search contacts by name, email, or other fields. CRITICAL: This returns an ARRAY. If array length > 0, contacts were found - USE THE DATA! If array length = 0, no matches. Do NOT say "not found" if you receive contact data.',

  // Dashboard Bundle - Critical for counts
  get_dashboard_bundle:
    '🚨 REQUIRED for "how many" questions! Returns totalLeads, totalAccounts, totalContacts, totalOpportunities counts. When user asks "how many leads/accounts/contacts/opportunities", ALWAYS call this tool FIRST. Do NOT use list_leads/list_accounts to count - those are for viewing records, not counting.',

  // Reports & Analytics
  get_health_summary: 'Get a health summary of the CRM data quality and system status.',
  get_sales_report:
    'Generate a sales report for a date range. Group by day, week, month, or quarter.',
  get_pipeline_report:
    'Get pipeline analysis with opportunity stages, values, and conversion rates.',
  get_activity_report:
    'Generate an activity report for a date range. Optionally filter by employee.',
  get_lead_conversion_report:
    'Get lead conversion metrics showing funnel stages and conversion rates.',
  // get_revenue_forecasts: 'Get revenue forecasts based on pipeline opportunities. Specify months_ahead.', // Not yet implemented
  clear_report_cache: 'Clear cached report data to force regeneration. Requires admin privileges.',

  // AI-Powered Next Actions (RAG-enabled)
  suggest_next_actions:
    'CRITICAL: Call this when user asks "what should I do next?", "what do you think?", "how should I proceed?", or similar open-ended questions. Analyzes entity state (notes, activities, stage) using RAG memory to suggest 2-3 specific next actions with reasoning. REQUIRED when users ask for guidance on next steps. Pass entity_type (lead/contact/account/opportunity) and entity_id.',

  // Navigation
  navigate_to_page:
    'Navigate the user to a specific CRM page or open a record detail panel. CRITICAL: When user says "open lead details for XYX Corp", you MUST pass "XYX Corp" as the record_identifier - the system will resolve it to a UUID. Example: navigate_to_page(tenant, "leads", "XYX Corp"). Valid pages: dashboard, leads, contacts, accounts, opportunities, activities, calendar, settings, workflows, reports. Do NOT pass null for record_identifier when user mentions a specific company or person name.',
  get_current_page:
    'Get information about the current page the user is viewing. Useful for context-aware responses.',

  // BizDev Sources (v3.0.0 workflow)
  create_bizdev_source:
    'Create a new BizDev Source (business development lead source) for later promotion to a Lead. This is the first step in the v3.0.0 workflow.',
  update_bizdev_source:
    'Update an existing BizDev Source by its ID. Can modify source_name, company_name, contact_name, email, phone, priority, status.',
  get_bizdev_source_details: 'Get the full details of a specific BizDev Source by its ID.',
  list_bizdev_sources:
    'List BizDev Sources with optional filtering by status (active, promoted, rejected) or priority.',
  search_bizdev_sources: 'Search BizDev Sources by name, company, or contact information.',
  promote_bizdev_source_to_lead:
    'Promote a BizDev Source to a Lead. This is the key v3.0.0 workflow transition: BizDev Source → Lead. Creates a Lead with provenance tracking.',
  delete_bizdev_source: 'Delete a BizDev Source by its ID.',
  archive_bizdev_sources: 'Archive multiple BizDev Sources by their IDs (bulk operation).',

  // v3.0.0 Lifecycle Orchestration (complete workflow tools)
  advance_to_lead:
    'v3.0.0 WORKFLOW STEP 1: Promote a BizDev Source to a Lead. Updates source status to "promoted", creates Lead with status "new". Returns lead_id for next step.',
  advance_to_qualified:
    'v3.0.0 WORKFLOW STEP 2: Mark a Lead as qualified. Updates Lead status from "new" to "qualified". Call this before conversion. Returns ready_for_conversion flag.',
  advance_to_account:
    'v3.0.0 WORKFLOW STEP 3: Convert a qualified Lead to Contact + Account + Opportunity. Creates Contact (prospect), optionally creates/links Account, optionally creates Opportunity (prospecting stage).',
  advance_opportunity_stage:
    'v3.0.0 WORKFLOW STEP 4: Move an Opportunity through sales stages (prospecting → qualification → proposal → negotiation → closed_won/closed_lost). Auto-calculates probability based on stage.',
  full_lifecycle_advance:
    'v3.0.0 COMPLETE WORKFLOW: Execute the full BizDev Source → Lead → Contact + Account + Opportunity lifecycle in a single call. Use for automation scenarios. Combines promote, qualify, and convert steps.',

  // AI Suggestions (Phase 3 Autonomous Operations)
  list_suggestions:
    'List AI-generated suggestions by status (pending, approved, rejected, applied, expired, all). These are autonomous recommendations from AI triggers.',
  get_suggestion_details:
    'Get full details of a specific AI suggestion including reasoning, confidence score, and suggested action payload.',
  get_suggestion_stats:
    'Get statistics about AI suggestions: counts by status, priority, and record type. Useful for dashboard metrics.',
  approve_suggestion:
    'Approve a pending AI suggestion, marking it ready for application. Requires reviewer notes.',
  reject_suggestion:
    'Reject an AI suggestion with reason. Helps improve future suggestion quality through feedback.',
  apply_suggestion:
    'Execute an approved AI suggestion. This performs the suggested action (create, update, etc.) on the target record.',
  trigger_suggestion_generation:
    'Manually trigger AI suggestion generation for a specific trigger ID. Runs the trigger logic immediately.',

  // Document Management
  list_documents:
    'List documents attached to an entity (account, lead, contact, etc.). Pass entity_type and entity_id to filter.',
  get_document_details: 'Get full details of a specific document by its ID.',
  create_document:
    'Create a new document record with file metadata. Attach to an entity via entity_type and entity_id.',
  update_document: 'Update document metadata like name, description, or entity assignment.',
  delete_document:
    'Delete a document by its ID. The actual file storage may be handled separately.',
  analyze_document:
    'Run AI analysis on a document. Pass analysis_type for specific analysis (summary, extract, classify).',
  search_documents: 'Search documents by name or content query.',

  // Employees Management
  list_employees:
    'List employees in the organization. Filter by role, department, or active status.',
  get_employee_details: 'Get full details of a specific employee by their ID.',
  create_employee: 'Create a new employee record with name, email, role, and department.',
  update_employee: 'Update employee information like role, department, or contact details.',
  delete_employee: 'Deactivate or delete an employee record.',
  search_employees: 'Search employees by name, email, or role.',
  get_employee_assignments: 'Get all accounts, leads, and activities assigned to an employee.',

  // Users Management (Admin operations)
  list_users:
    'List user accounts. Filter by role or active status. Use for user management dashboards.',
  get_user_details: 'Get full details of a specific user by their ID.',
  get_current_user_profile: "Get the current authenticated user's profile.",
  get_user_profiles: 'Get all user profiles for the tenant. Useful for assignment dropdowns.',
  create_user: 'Create a new user account. Requires admin privileges.',
  update_user:
    'Update user information like role, email, or permissions. Requires admin privileges.',
  delete_user: 'Delete or deactivate a user account. Requires admin privileges.',
  search_users: 'Search users by name or email.',
  invite_user: 'Send an invitation to a user to join the CRM. Requires admin privileges.',

  // Telephony
  initiate_call: 'Initiate an AI-powered outbound phone call to a phone number.',
  call_contact: 'Initiate an AI-powered outbound phone call to a Contact by their ID.',
  check_calling_provider:
    'Check if a calling provider (CallFluent, Thoughtly) is configured and available.',
  get_calling_agents: 'List available AI calling agents and their configurations.',

  // Web Research
  search_web: 'Search the web for information using a query. Returns search results.',
  fetch_web_page: 'Fetch the content of a specific web page by URL.',
  lookup_company_info: 'Look up publicly available information about a company by name or domain.',

  // Workflows
  list_workflow_templates: 'List all available workflow templates that can be instantiated.',
  get_workflow_template:
    'Get details of a specific workflow template including required parameters.',
  instantiate_workflow_template:
    'Create and start a new workflow instance from a template with specific parameters.',

  // Workflow Delegation (Agent Orchestration)
  trigger_workflow_by_name:
    'Delegate a task to a named workflow. Use this when user wants to hand off work to an automated agent workflow. Pass workflow_name (e.g., "Sales Manager Workflow", "Customer Service Workflow"), context object with relevant data, and related_entity_type/id. The workflow will handle the task autonomously and log progress via notes.',
  get_workflow_progress:
    'Check the status and progress of a workflow execution by its execution_id. Returns current status, started_at, execution_log, and current_node.',
  list_active_workflows:
    'List all currently running workflow executions. Use to see what automated processes are active.',
  get_workflow_notes:
    'Get notes/progress updates created by a workflow execution. Use to report on what an agent workflow has accomplished.',
};

/**
 * Generate OpenAI tool schemas from the Braid registry
 * @param {string[]} [allowedToolNames] - Optional allowlist of tool names
 * @returns {Promise<Object[]>}
 */
export async function generateToolSchemas(allowedToolNames = null) {
  const toolNames =
    Array.isArray(allowedToolNames) && allowedToolNames.length > 0
      ? allowedToolNames
      : Object.keys(TOOL_REGISTRY);

  const schemas = [];

  for (const toolName of toolNames) {
    const config = TOOL_REGISTRY[toolName];
    if (!config) {
      continue;
    }

    const braidPath = path.join(TOOLS_DIR, config.file);

    try {
      const schema = await loadToolSchema(braidPath, config.function);
      const description = TOOL_DESCRIPTIONS[toolName];

      // Enrich parameter descriptions with semantic meaning
      const enrichedParameters = { ...schema.function?.parameters };
      if (PARAMETER_DESCRIPTIONS[toolName] && enrichedParameters?.properties) {
        for (const [paramName, paramDesc] of Object.entries(PARAMETER_DESCRIPTIONS[toolName])) {
          if (enrichedParameters.properties[paramName]) {
            enrichedParameters.properties[paramName] = {
              ...enrichedParameters.properties[paramName],
              description: paramDesc,
            };
          }
        }
      }

      schemas.push({
        ...schema,
        function: {
          ...schema.function,
          name: toolName,
          description: description || schema.function?.description,
          parameters: enrichedParameters,
        },
      });
    } catch (error) {
      console.warn(`[Braid] Failed to generate schema for ${toolName}:`, error.message);
    }
  }

  return schemas;
}

/**
 * Calculate timezone offset string (e.g., "-05:00") from IANA timezone name
 * @param {string} timezone - IANA timezone name (e.g., "America/New_York")
 * @returns {string} Offset string like "-05:00" or "+00:00"
 */
function getTimezoneOffset(timezone) {
  try {
    const now = new Date();
    // Get the offset in minutes using Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    // offsetPart.value is like "GMT-05:00" or "GMT+05:30"
    if (offsetPart?.value) {
      const match = offsetPart.value.match(/GMT([+-]\d{2}:\d{2})/);
      if (match) return match[1];
    }
    // Fallback: calculate manually
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const diffMinutes = (local - utc) / 60000;
    const sign = diffMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(diffMinutes);
    const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const mins = String(absMinutes % 60).padStart(2, '0');
    return `${sign}${hours}:${mins}`;
  } catch {
    return '-05:00'; // Default to EST on error
  }
}

/**
 * Enhanced system prompt for Executive Assistant
 * Now a function to get fresh date each time and accepts user timezone
 * @param {string} timezone - IANA timezone name (default: America/New_York)
 */
export function getBraidSystemPrompt(timezone = 'America/New_York') {
  const now = new Date();
  // FIXED: Calculate current date/time in USER'S timezone, not server timezone
  const currentDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone, // Use user's timezone!
  });
  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone, // Use user's timezone!
  });
  const currentYear = now.toLocaleDateString('en-US', { year: 'numeric', timeZone: timezone });
  const timezoneOffset = getTimezoneOffset(timezone);

  return `
You are AI-SHA - an AI Super Hi-performing Assistant designed to be an Executive Assistant for CRM operations.

**!!! CRITICAL: DATE, TIME, AND TIMEZONE AWARENESS !!!**
- The current date is: ${currentDate}
- The current time is: ${currentTime} (${timezone})
- The current year is: ${currentYear}
- The user's timezone is: ${timezone} (offset: ${timezoneOffset})
- NEVER create activities, tasks, or meetings with due dates in the past
- When user says "today", use today's date with a future time (e.g., 5:00 PM if morning)
- When user says "tomorrow", use tomorrow's date
- If no date specified, default to tomorrow at 9:00 AM
- **ALWAYS use the user's timezone offset (${timezoneOffset}) in all date/time values**
- Use ISO 8601 format WITH timezone: YYYY-MM-DDTHH:MM:SS${timezoneOffset}
- Example: For 3:00 PM, use "2026-02-05T15:00:00${timezoneOffset}" NOT "2026-02-05T15:00:00"
- IGNORE any timezone the user mentions - ALWAYS use their configured timezone (${timezone})

**!!! CRITICAL: DAY-OF-WEEK ACCURACY !!!**
- When confirming scheduled events, use the DATE ONLY (e.g., "February 13th, 2026")
- DO NOT specify the day of week (Monday, Tuesday, etc.) for future dates unless explicitly provided by the user
- If you must mention the day of week, calculate it accurately: February 2026 starts on Sunday, so the 13th is a Friday
- NEVER guess day names - it's better to omit them than to be wrong

**STOP! BEFORE ANSWERING "HOW MANY" QUESTIONS - READ THIS!**

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

**CONVERSATION CONTINUITY & CONTEXT AWARENESS**
- Always track the last discussed entities (lead/contact/account/opportunity) and reuse them for follow-up questions.
- Handle implicit references (e.g., "I think I only have 1") by referring to recent messages and session entities.
- Look at the last 3-5 messages to interpret implicit references and respond naturally.
- If a user says "I think I only have 1" after a list, interpret as a count confirmation for that list.
- Example:
  - User: "Show me warm leads"
  - User: "I think I only have 1"
  - User: "summarize the notes for me"
  - Action: refer to recent messages and Track what entities were just discussed.
- NEVER respond with "I'm not sure what action you want to take".
- NEVER EVER respond with "I'm not sure what action you want to take".

**SUGGEST NEXT ACTIONS (MANDATORY)**
- If the user asks any of these, you MUST ALWAYS call suggest_next_actions tool:
  - "What should I do next?"
  - "What do you think?"
  - "What are my next steps?"
  - "What do you recommend?"
  - "How should I proceed?"
  - "What's the next step?"
- This is MANDATORY. ALWAYS call suggest_next_actions tool before answering.
`;
}

// Backwards compatibility - BRAID_SYSTEM_PROMPT as a getter that calls the function
// This ensures existing code that imports BRAID_SYSTEM_PROMPT still works
export const BRAID_SYSTEM_PROMPT = getBraidSystemPrompt();

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
    switch (error.tag) {
      case 'NotFound':
        return `${toolName}: ${error.entity || 'Record'} with ID "${error.id || 'unknown'}" was NOT FOUND. This is NOT a network error - the record may not exist or the ID may be incorrect. Suggest verifying the name/ID with the user.`;
      case 'ValidationError':
        return `${toolName}: Validation error - ${error.message || 'Invalid data provided'}. Field: ${error.field || 'unknown'}. Ask the user to verify the input.`;
      case 'PermissionDenied':
        return `${toolName}: Access denied for "${error.operation || 'this operation'}". Reason: ${error.reason || 'insufficient permissions'}. User may need to log in again or contact an administrator.`;
      case 'NetworkError':
        return `${toolName}: Network error (HTTP ${error.code || 'unknown'}). This may be a temporary connectivity issue. Suggest trying again in a moment.`;
      case 'DatabaseError':
        return `${toolName}: Database error - ${error.message || 'query failed'}. This is a server-side issue, not a user error.`;
      case 'APIError': {
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
    const totalForecast = (data.opportunities || []).reduce(
      (sum, o) => sum + ((o.amount || 0) * (o.probability || 0)) / 100,
      0,
    );

    let summary = `Snapshot loaded: ${accountCount} accounts, ${leadsCount} leads, ${contactsCount} contacts, ${oppsCount} opportunities, ${activitiesCount} activities. `;

    if (accountCount > 0) {
      const anyRevenueValues = data.accounts.some(
        (a) => typeof a.annual_revenue === 'number' && a.annual_revenue > 0,
      );
      if (anyRevenueValues) {
        summary += `Total revenue: $${totalRevenue.toLocaleString()}. `;
      } else {
        summary += 'No revenue recorded for any account. ';
      }
      const topAccounts = [...data.accounts]
        .filter((a) => a.annual_revenue > 0)
        .sort((a, b) => (b.annual_revenue || 0) - (a.annual_revenue || 0))
        .slice(0, 3);

      if (topAccounts.length > 0) {
        summary += `Top accounts: ${topAccounts.map((a) => `${a.name} ($${(a.annual_revenue || 0).toLocaleString()})`).join(', ')}. `;
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

  // Array results (search, list operations)
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return `${toolName} found NO RESULTS. The search returned an empty array - no matching records exist.`;
    }

    // Extract preview info from first result
    const firstItem = data[0];
    const itemName =
      firstItem.first_name && firstItem.last_name
        ? `${firstItem.first_name} ${firstItem.last_name}`
        : firstItem.name || firstItem.title || firstItem.id || 'record';

    if (data.length === 1) {
      // CRITICAL: Include ID so the LLM can use it in follow-up tool calls (update, delete, etc.)
      const details = [];
      if (firstItem.id) details.push(`id: ${firstItem.id}`);
      if (firstItem.company) details.push(`company: ${firstItem.company}`);
      if (firstItem.job_title) details.push(`job_title: ${firstItem.job_title}`);
      if (firstItem.status) details.push(`status: ${firstItem.status}`);
      if (firstItem.email) details.push(`email: ${firstItem.email}`);
      if (firstItem.phone || firstItem.phone_number)
        details.push(`phone: ${firstItem.phone || firstItem.phone_number}`);
      if (firstItem.assigned_to_name) details.push(`assigned_to: ${firstItem.assigned_to_name}`);
      else if (firstItem.assigned_to) details.push(`assigned_to_id: ${firstItem.assigned_to}`);
      if (firstItem.stage) details.push(`stage: ${firstItem.stage}`);
      if (firstItem.amount) details.push(`amount: ${firstItem.amount}`);
      const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
      return `${toolName} found 1 result: "${itemName}"${detailStr}.`;
    }

    // Multiple results — CRITICAL: Include IDs so the LLM can reference them in follow-up calls
    const preview = data
      .slice(0, 5)
      .map((item) => {
        const name =
          item.first_name && item.last_name
            ? `${item.first_name} ${item.last_name}`
            : item.name || item.title || item.id;
        const id = item.id ? ` [id: ${item.id}]` : '';
        const parts = [];
        if (item.company) parts.push(item.company);
        if (item.job_title) parts.push(item.job_title);
        if (item.status) parts.push(item.status);
        else if (item.stage) parts.push(item.stage);
        if (item.assigned_to_name) parts.push(`assigned: ${item.assigned_to_name}`);
        else if (item.assigned_to) parts.push(`assigned_id: ${item.assigned_to}`);
        const extra = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        return `${name}${id}${extra}`;
      })
      .join('; ');

    return `${toolName} found ${data.length} results: ${preview}${data.length > 5 ? '; ...' : ''}`;
  }

  // Object with nested array (common v2 response shape: { leads: [...], total: N })
  if (typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (keys.length === 0) return `${toolName} returned empty object`;

    // Unwrap nested arrays (e.g., { leads: [...], total: 5 } or { contacts: [...] })
    const arrayKey = keys.find((k) => Array.isArray(data[k]) && data[k].length > 0);
    if (arrayKey) {
      const items = data[arrayKey];
      const total = data.total || items.length;
      // Show up to 25 items — enough for most CRM lists without excessive tokens
      const maxPreview = Math.min(items.length, 25);
      const preview = items
        .slice(0, maxPreview)
        .map((item) => {
          const name =
            item.first_name && item.last_name
              ? `${item.first_name} ${item.last_name}`
              : item.name || item.title || item.id;
          const id = item.id ? ` [id: ${item.id}]` : '';
          const parts = [];
          if (item.company) parts.push(item.company);
          if (item.job_title) parts.push(item.job_title);
          if (item.status) parts.push(item.status);
          else if (item.stage) parts.push(item.stage);
          if (item.assigned_to_name) parts.push(`assigned: ${item.assigned_to_name}`);
          else if (item.assigned_to) parts.push(`assigned_id: ${item.assigned_to}`);
          const extra = parts.length > 0 ? ` (${parts.join(', ')})` : '';
          return `${name}${id}${extra}`;
        })
        .join('; ');
      return `${toolName} found ${total} results: ${preview}${items.length > maxPreview ? '; ...' : ''}`;
    }

    // Include id if present (single record)
    if (data.id) {
      return `${toolName} returned record with ID: ${data.id}, fields: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
    }
    return `${toolName} result with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
  }

  return `${toolName} result: ${data}`;
}

export const TOOLS_DIR_PATH = TOOLS_DIR;

/**
 * Validate that @policy annotations in .braid files match TOOL_REGISTRY.
 * Call at startup to catch policy drift between .braid source and registry.
 * @returns {{ valid: boolean, mismatches: Array, missing: Array }}
 */
export async function validateRegistryPolicies() {
  const { parse } = await import('../../../braid-llm-kit/tools/braid-parse.js');
  const { extractPolicies } = await import('../../../braid-llm-kit/tools/braid-transpile.js');
  const fs = await import('fs');

  const mismatches = [];
  const missing = [];
  const seenFiles = new Set();

  // Build function→policy map from .braid files
  const braidPolicies = {};
  for (const [toolName, config] of Object.entries(TOOL_REGISTRY)) {
    const braidFile = path.join(TOOLS_DIR, config.file);
    if (!seenFiles.has(config.file)) {
      seenFiles.add(config.file);
      try {
        const src = fs.readFileSync(braidFile, 'utf8');
        const ast = parse(src, config.file);
        const policies = extractPolicies(ast);
        Object.assign(braidPolicies, policies);
      } catch (e) {
        console.warn(`[Registry] Could not parse ${config.file}: ${e.message}`);
      }
    }

    const fnName = config.function;
    const braidPolicy = braidPolicies[fnName];
    const registryPolicy = config.policy;

    if (!braidPolicy) {
      missing.push({ toolName, fn: fnName, file: config.file, registryPolicy });
    } else if (braidPolicy !== registryPolicy) {
      mismatches.push({ toolName, fn: fnName, file: config.file, braidPolicy, registryPolicy });
    }
  }

  if (mismatches.length > 0) {
    console.error('[Registry] Policy mismatches between .braid files and TOOL_REGISTRY:');
    for (const m of mismatches) {
      console.error(
        `  ${m.fn} in ${m.file}: @policy(${m.braidPolicy}) != registry policy '${m.registryPolicy}'`,
      );
    }
  }
  if (missing.length > 0) {
    console.warn(
      `[Registry] ${missing.length} functions missing @policy annotation in .braid files`,
    );
  }

  return { valid: mismatches.length === 0, mismatches, missing };
}
