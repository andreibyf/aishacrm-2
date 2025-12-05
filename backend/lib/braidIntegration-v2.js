/**
 * Braid AI Integration Module - Executive Assistant Edition
 * Comprehensive tool suite for AI-SHA CRM Executive Assistant
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { executeBraid, loadToolSchema, createBackendDeps, CRM_POLICIES } from '../../braid-llm-kit/sdk/index.js';

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
  delete_account: { file: 'accounts.braid', function: 'deleteAccount', policy: 'WRITE_OPERATIONS' },
  
  // Lead Management
  create_lead: { file: 'leads.braid', function: 'createLead', policy: 'WRITE_OPERATIONS' },
  update_lead: { file: 'leads.braid', function: 'updateLead', policy: 'WRITE_OPERATIONS' },
  convert_lead_to_account: { file: 'leads.braid', function: 'convertLeadToAccount', policy: 'WRITE_OPERATIONS' },
  list_leads: { file: 'leads.braid', function: 'listLeads', policy: 'READ_ONLY' },
  delete_lead: { file: 'leads.braid', function: 'deleteLead', policy: 'WRITE_OPERATIONS' },
  
  // Activity & Calendar
  create_activity: { file: 'activities.braid', function: 'createActivity', policy: 'WRITE_OPERATIONS' },
  update_activity: { file: 'activities.braid', function: 'updateActivity', policy: 'WRITE_OPERATIONS' },
  mark_activity_complete: { file: 'activities.braid', function: 'markActivityComplete', policy: 'WRITE_OPERATIONS' },
  get_upcoming_activities: { file: 'activities.braid', function: 'getUpcomingActivities', policy: 'READ_ONLY' },
  schedule_meeting: { file: 'activities.braid', function: 'scheduleMeeting', policy: 'WRITE_OPERATIONS' },
  delete_activity: { file: 'activities.braid', function: 'deleteActivity', policy: 'WRITE_OPERATIONS' },
  
  // Notes
  create_note: { file: 'notes.braid', function: 'createNote', policy: 'WRITE_OPERATIONS' },
  update_note: { file: 'notes.braid', function: 'updateNote', policy: 'WRITE_OPERATIONS' },
  search_notes: { file: 'notes.braid', function: 'searchNotes', policy: 'READ_ONLY' },
  get_notes_for_record: { file: 'notes.braid', function: 'getNotesForRecord', policy: 'READ_ONLY' },
  delete_note: { file: 'notes.braid', function: 'deleteNote', policy: 'WRITE_OPERATIONS' },
  
  // Opportunities
  create_opportunity: { file: 'opportunities.braid', function: 'createOpportunity', policy: 'WRITE_OPERATIONS' },
  update_opportunity: { file: 'opportunities.braid', function: 'updateOpportunity', policy: 'WRITE_OPERATIONS' },
  list_opportunities_by_stage: { file: 'opportunities.braid', function: 'listOpportunitiesByStage', policy: 'READ_ONLY' },
  get_opportunity_forecast: { file: 'opportunities.braid', function: 'getOpportunityForecast', policy: 'READ_ONLY' },
  mark_opportunity_won: { file: 'opportunities.braid', function: 'markOpportunityWon', policy: 'WRITE_OPERATIONS' },
  delete_opportunity: { file: 'opportunities.braid', function: 'deleteOpportunity', policy: 'WRITE_OPERATIONS' },
  
  // Contacts
  create_contact: { file: 'contacts.braid', function: 'createContact', policy: 'WRITE_OPERATIONS' },
  update_contact: { file: 'contacts.braid', function: 'updateContact', policy: 'WRITE_OPERATIONS' },
  list_contacts_for_account: { file: 'contacts.braid', function: 'listContactsForAccount', policy: 'READ_ONLY' },
  search_contacts: { file: 'contacts.braid', function: 'searchContacts', policy: 'READ_ONLY' },
  delete_contact: { file: 'contacts.braid', function: 'deleteContact', policy: 'WRITE_OPERATIONS' },
  
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
  get_calling_agents: { file: 'telephony.braid', function: 'getCallingAgents', policy: 'READ_ONLY' }
};

/**
 * Enhanced system prompt for Executive Assistant
 */
export const BRAID_SYSTEM_PROMPT = `
You are AI-SHA - an AI Super Hi-performing Assistant designed to be an Executive Assistant for CRM operations.

**Your Capabilities:**
- **CRM Management:** Create, read, update accounts, leads, contacts, opportunities
- **Calendar & Activities:** Schedule meetings, track tasks, manage deadlines
- **Notes & Documentation:** Create, search, and organize notes across all records
- **Sales Pipeline:** Track opportunities, update stages, forecast revenue
- **Web Research:** Search for company information, fetch external data
- **Workflow Automation:** Create workflows from templates with customizable parameters
- **AI Calling:** Initiate outbound calls via CallFluent or Thoughtly AI agents
- **Proactive Assistance:** Suggest next actions, follow-ups, priority tasks

**Data Structure Guide (CRITICAL - Matches DB):**
- Accounts: {id, name, annual_revenue, industry, website, email, phone, assigned_to, metadata}
- Leads: {id, first_name, last_name, email, company, status, source, phone, job_title, assigned_to}
- Contacts: {id, first_name, last_name, email, phone, job_title, account_id, assigned_to}
- Opportunities: {id, name, description, amount, stage, probability, close_date, account_id, contact_id, assigned_to}
- Activities: {id, type, subject, body, status, due_date, assigned_to}

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

**Best Practices:**
- Always use tools to fetch current data before answering
- Be proactive: suggest follow-ups, next actions, related records
- Use proper date formats (ISO 8601)
- All operations are tenant-isolated
- Check calendar for conflicts before scheduling
- Before initiating calls, confirm contact has a valid phone number
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
    return `Error executing ${toolName}: ${result.error?.message || JSON.stringify(result.error)}`;
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
  
  // Generic
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return `${toolName} returned empty object`;
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
 * Execute a Braid tool
 */
export async function executeBraidTool(toolName, args, tenantRecord, userId = null) {
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
  const deps = createBackendDeps('http://localhost:3001', tenantUuid, userId);

  // Normalize arguments into a single object for Braid
  const normalizedArgs = normalizeToolArgs(toolName, args, tenantRecord);

  // Convert object args to positional array based on function signature
  const positionalArgs = objectToPositionalArgs(toolName, normalizedArgs);

  try {
    const result = await executeBraid(
      braidPath,
      config.function,
      policy,
      deps,
      positionalArgs,
      { cache: config.policy === 'READ_ONLY', timeout: 30000 }
    );
    
    return result;
  } catch (error) {
    return {
      tag: 'Err',
      error: { type: 'ExecutionError', message: error.message, stack: error.stack }
    };
  }
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
  deleteAccount: ['tenant', 'account_id'],

  // Leads
  createLead: ['tenant', 'first_name', 'last_name', 'email', 'company', 'phone', 'source'],
  updateLead: ['tenant', 'lead_id', 'updates'],
  convertLeadToAccount: ['tenant', 'lead_id', 'options'],
  listLeads: ['tenant', 'status', 'limit'],
  deleteLead: ['tenant', 'lead_id'],

  // Activities
  createActivity: ['tenant', 'type', 'subject', 'body', 'related_to', 'related_id', 'due_date'],
  updateActivity: ['tenant', 'activity_id', 'updates'],
  markActivityComplete: ['tenant', 'activity_id'],
  getUpcomingActivities: ['tenant', 'days', 'limit'],
  scheduleMeeting: ['tenant', 'subject', 'attendees', 'date', 'duration', 'location'],
  deleteActivity: ['tenant', 'activity_id'],

  // Notes
  createNote: ['tenant', 'content', 'related_to', 'related_id'],
  updateNote: ['tenant', 'note_id', 'content'],
  searchNotes: ['tenant', 'query', 'limit'],
  getNotesForRecord: ['tenant', 'related_to', 'related_id'],
  deleteNote: ['tenant', 'note_id'],

  // Opportunities
  createOpportunity: ['tenant', 'name', 'description', 'amount', 'stage', 'probability', 'close_date', 'account_id', 'contact_id'],
  updateOpportunity: ['tenant', 'opportunity_id', 'updates'],
  listOpportunitiesByStage: ['tenant', 'stage', 'limit'],
  getOpportunityForecast: ['tenant', 'period'],
  markOpportunityWon: ['tenant', 'opportunity_id', 'close_details'],
  deleteOpportunity: ['tenant', 'opportunity_id'],

  // Contacts
  createContact: ['tenant', 'first_name', 'last_name', 'email', 'phone', 'job_title', 'account_id'],
  updateContact: ['tenant', 'contact_id', 'updates'],
  listContactsForAccount: ['tenant', 'account_id', 'limit'],
  searchContacts: ['tenant', 'query', 'limit'],
  deleteContact: ['tenant', 'contact_id'],

  // Web Research
  searchWeb: ['query', 'limit'],
  fetchWebPage: ['url'],
  lookupCompanyInfo: ['company_name']
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

  // Ensure tenant hint for tools that expect it
  const toolsNeedingTenant = new Set([
    'fetch_tenant_snapshot',
    'list_accounts',
    'list_leads',
    'list_opportunities_by_stage',
    'get_upcoming_activities',
    'get_notes_for_record',
    'search_contacts',
  ]);

  if (toolsNeedingTenant.has(toolName)) {
    const currentTenant = args.tenant || args.tenant_id || null;
    // Replace missing or placeholder tenants (like "default") with canonical UUID
    if (!currentTenant || currentTenant === 'default') {
      args.tenant = tenantUuid;
    }
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

  return args;
}
