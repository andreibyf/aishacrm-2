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
const TOOL_REGISTRY = {
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
  
  // Activity & Calendar
  create_activity: { file: 'activities.braid', function: 'createActivity', policy: 'WRITE_OPERATIONS' },
  update_activity: { file: 'activities.braid', function: 'updateActivity', policy: 'WRITE_OPERATIONS' },
  mark_activity_complete: { file: 'activities.braid', function: 'markActivityComplete', policy: 'WRITE_OPERATIONS' },
  get_upcoming_activities: { file: 'activities.braid', function: 'getUpcomingActivities', policy: 'READ_ONLY' },
  schedule_meeting: { file: 'activities.braid', function: 'scheduleMeeting', policy: 'WRITE_OPERATIONS' },
  
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
  
  // Contacts
  create_contact: { file: 'contacts.braid', function: 'createContact', policy: 'WRITE_OPERATIONS' },
  update_contact: { file: 'contacts.braid', function: 'updateContact', policy: 'WRITE_OPERATIONS' },
  list_contacts_for_account: { file: 'contacts.braid', function: 'listContactsForAccount', policy: 'READ_ONLY' },
  search_contacts: { file: 'contacts.braid', function: 'searchContacts', policy: 'READ_ONLY' },
  
  // Web Research
  search_web: { file: 'web-research.braid', function: 'searchWeb', policy: 'READ_ONLY' },
  fetch_web_page: { file: 'web-research.braid', function: 'fetchWebPage', policy: 'READ_ONLY' },
  lookup_company_info: { file: 'web-research.braid', function: 'lookupCompanyInfo', policy: 'READ_ONLY' }
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
- **Proactive Assistance:** Suggest next actions, follow-ups, priority tasks

**Data Structure Guide (CRITICAL - Matches DB):**
- Accounts: {id, name, annual_revenue, industry, website, email, phone, assigned_to, metadata}
- Leads: {id, first_name, last_name, email, company, status, source, phone, job_title, assigned_to}
- Contacts: {id, first_name, last_name, email, phone, job_title, account_id, assigned_to}
- Opportunities: {id, name, description, amount, stage, probability, close_date, account_id, contact_id, assigned_to}
- Activities: {id, type, subject, body, status, due_date, assigned_to}

**Best Practices:**
- Always use tools to fetch current data before answering
- Be proactive: suggest follow-ups, next actions, related records
- Use proper date formats (ISO 8601)
- All operations are tenant-isolated
- Check calendar for conflicts before scheduling
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
export async function generateToolSchemas() {
  const schemas = [];
  console.log('[Braid] Generating tool schemas from', TOOLS_DIR);
  for (const [toolName, config] of Object.entries(TOOL_REGISTRY)) {
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
  const deps = createBackendDeps('http://localhost:3001', tenantRecord.tenant_id, userId);
  
  // Convert args object to array for Braid function
  const argArray = Object.values(args);
  
  try {
    const result = await executeBraid(
      braidPath,
      config.function,
      policy,
      deps,
      argArray,
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
