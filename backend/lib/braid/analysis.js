/**
 * Braid Analysis Module
 * Tool dependency analysis, graph visualization, and impact assessment
 */

import { TOOL_REGISTRY } from './registry.js';
// NOTE: TOOL_CHAINS loaded lazily in getToolImpactAnalysis() to break
// circular dependency: execution.js → analysis.js → chains.js → execution.js
import { parse as parseBraid } from '../../../braid-llm-kit/tools/braid-parse.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSISTANT_DIR = path.resolve(__dirname, '..', '..', '..', 'braid-llm-kit', 'examples', 'assistant');

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
  },
  DOCUMENTS: {
    name: 'Documents',
    color: '#F97316', // orange
    icon: 'file'
  },
  EMPLOYEES: {
    name: 'Employees',
    color: '#84CC16', // lime
    icon: 'user-check'
  },
  BIZDEV: {
    name: 'BizDev Sources',
    color: '#06B6D4', // cyan
    icon: 'lightbulb'
  },
  LIFECYCLE: {
    name: 'Lifecycle',
    color: '#8B5CF6', // purple
    icon: 'arrow-right'
  },
  NAVIGATION: {
    name: 'Navigation',
    color: '#6B7280', // gray
    icon: 'navigation'
  },
  NOTES: {
    name: 'Notes',
    color: '#EF4444', // red
    icon: 'edit'
  },
  SNAPSHOT: {
    name: 'Snapshot',
    color: '#14B8A6', // teal
    icon: 'camera'
  },
  SUGGESTIONS: {
    name: 'AI Suggestions',
    color: '#A855F7', // violet
    icon: 'sparkles'
  },
  TELEPHONY: {
    name: 'Telephony',
    color: '#059669', // emerald
    icon: 'phone'
  },
  USERS: {
    name: 'Users',
    color: '#DC2626', // red
    icon: 'user'
  },
  WEB_RESEARCH: {
    name: 'Web Research',
    color: '#7C2D12', // amber-800
    icon: 'search'
  },
  WORKFLOWS: {
    name: 'Workflows',
    color: '#4F46E5', // indigo
    icon: 'workflow'
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
    inputs: ['name', 'industry'],
    outputs: ['account'],
    effects: ['create'],
    description: 'Create a new account/company record'
  },
  get_account_details: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: ['account_id'],
    outputs: ['account'],
    effects: ['read'],
    description: 'Retrieve account details by ID'
  },
  list_accounts: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: ['limit', 'offset'],
    outputs: ['accounts[]'],
    effects: ['read'],
    description: 'List accounts with pagination'
  },
  search_accounts: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: ['query'],
    outputs: ['accounts[]'],
    effects: ['read'],
    description: 'Search accounts by name or other fields'
  },
  search_accounts_by_status: {
    category: 'ACCOUNTS',
    dependencies: [],
    inputs: ['status'],
    outputs: ['accounts[]'],
    effects: ['read'],
    description: 'Search accounts filtered by status'
  },
  update_account: {
    category: 'ACCOUNTS',
    dependencies: ['get_account_details'],
    inputs: ['account_id', 'updates'],
    outputs: ['account'],
    effects: ['update'],
    description: 'Update account fields'
  },
  delete_account: {
    category: 'ACCOUNTS',
    dependencies: ['get_account_details'],
    inputs: ['account_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete an account (cascades to related records)'
  },

  // ========== ACTIVITIES ==========
  create_activity: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['subject', 'activity_type', 'due_date', 'entity_type', 'entity_id'],
    outputs: ['activity'],
    effects: ['create'],
    description: 'Schedule an activity (call, meeting, task, email)'
  },
  get_activity_details: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['activity_id'],
    outputs: ['activity'],
    effects: ['read'],
    description: 'Retrieve activity details by ID'
  },
  list_activities: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['status', 'limit'],
    outputs: ['activities[]'],
    effects: ['read'],
    description: 'List activities with optional status filter'
  },
  search_activities: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['query'],
    outputs: ['activities[]'],
    effects: ['read'],
    description: 'Search activities by subject or body'
  },
  get_upcoming_activities: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['assigned_to', 'days'],
    outputs: ['activities[]'],
    effects: ['read'],
    description: 'Get upcoming activities for a user'
  },
  update_activity: {
    category: 'ACTIVITIES',
    dependencies: ['get_activity_details'],
    inputs: ['activity_id', 'updates'],
    outputs: ['activity'],
    effects: ['update'],
    description: 'Update activity fields'
  },
  mark_activity_complete: {
    category: 'ACTIVITIES',
    dependencies: ['get_activity_details'],
    inputs: ['activity_id'],
    outputs: ['activity'],
    effects: ['update'],
    description: 'Mark activity as completed'
  },
  schedule_meeting: {
    category: 'ACTIVITIES',
    dependencies: [],
    inputs: ['subject', 'date', 'attendees'],
    outputs: ['activity'],
    effects: ['create'],
    description: 'Schedule a new meeting with attendees'
  },
  delete_activity: {
    category: 'ACTIVITIES',
    dependencies: ['get_activity_details'],
    inputs: ['activity_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete an activity'
  },

  // ========== CONTACTS ==========
  create_contact: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['first_name', 'last_name', 'email', 'phone', 'job_title', 'account_id'],
    outputs: ['contact'],
    effects: ['create'],
    description: 'Create a new contact record'
  },
  get_contact_details: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['contact_id'],
    outputs: ['contact'],
    effects: ['read'],
    description: 'Retrieve contact details by ID'
  },
  list_contacts_for_account: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['account_id', 'limit'],
    outputs: ['contacts[]'],
    effects: ['read'],
    description: 'List all contacts associated with an account'
  },
  search_contacts: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['query', 'limit'],
    outputs: ['contacts[]'],
    effects: ['read'],
    description: 'Search contacts by name or other fields'
  },
  get_contact_by_name: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['name'],
    outputs: ['contact'],
    effects: ['read'],
    description: 'Get contact details by searching for name'
  },
  list_all_contacts: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['limit'],
    outputs: ['contacts[]'],
    effects: ['read'],
    description: 'List all contacts with pagination'
  },
  search_contacts_by_status: {
    category: 'CONTACTS',
    dependencies: [],
    inputs: ['status', 'limit'],
    outputs: ['contacts[]'],
    effects: ['read'],
    description: 'Search contacts filtered by status'
  },
  update_contact: {
    category: 'CONTACTS',
    dependencies: ['get_contact_details'],
    inputs: ['contact_id', 'updates'],
    outputs: ['contact'],
    effects: ['update'],
    description: 'Update contact fields'
  },
  delete_contact: {
    category: 'CONTACTS',
    dependencies: ['get_contact_details'],
    inputs: ['contact_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete a contact record'
  },

  // ========== LEADS ==========
  create_lead: {
    category: 'LEADS',
    dependencies: [],
    inputs: ['first_name', 'last_name', 'email', 'phone', 'company', 'status', 'source'],
    outputs: ['lead'],
    effects: ['create'],
    description: 'Create a new lead record'
  },
  get_lead_details: {
    category: 'LEADS',
    dependencies: [],
    inputs: ['lead_id'],
    outputs: ['lead'],
    effects: ['read'],
    description: 'Retrieve lead details by ID'
  },
  list_leads: {
    category: 'LEADS',
    dependencies: [],
    inputs: ['status', 'account_id', 'limit'],
    outputs: ['leads[]'],
    effects: ['read'],
    description: 'List leads with optional status filter'
  },
  search_leads: {
    category: 'LEADS',
    dependencies: [],
    inputs: ['query', 'limit'],
    outputs: ['leads[]'],
    effects: ['read'],
    description: 'Search leads by name, email, or company'
  },
  search_leads_by_status: {
    category: 'LEADS',
    dependencies: [],
    inputs: ['status', 'limit'],
    outputs: ['leads[]'],
    effects: ['read'],
    description: 'Search leads filtered by status'
  },
  qualify_lead: {
    category: 'LEADS',
    dependencies: ['get_lead_details'],
    inputs: ['lead_id'],
    outputs: ['lead'],
    effects: ['update'],
    description: 'Mark lead as qualified'
  },
  update_lead: {
    category: 'LEADS',
    dependencies: ['get_lead_details'],
    inputs: ['lead_id', 'updates'],
    outputs: ['lead'],
    effects: ['update'],
    description: 'Update lead fields'
  },
  delete_lead: {
    category: 'LEADS',
    dependencies: ['get_lead_details'],
    inputs: ['lead_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete a lead record'
  },

  // ========== OPPORTUNITIES ==========
  create_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: [],
    inputs: ['name', 'amount', 'stage', 'close_date', 'account_id', 'contact_id'],
    outputs: ['opportunity'],
    effects: ['create'],
    description: 'Create a new opportunity (deal)'
  },
  get_opportunity_details: {
    category: 'OPPORTUNITIES',
    dependencies: [],
    inputs: ['opportunity_id'],
    outputs: ['opportunity'],
    effects: ['read'],
    description: 'Retrieve opportunity details by ID'
  },
  list_opportunities_by_stage: {
    category: 'OPPORTUNITIES',
    dependencies: [],
    inputs: ['stage', 'limit'],
    outputs: ['opportunities[]'],
    effects: ['read'],
    description: 'List opportunities filtered by stage'
  },
  search_opportunities: {
    category: 'OPPORTUNITIES',
    dependencies: [],
    inputs: ['query', 'limit'],
    outputs: ['opportunities[]'],
    effects: ['read'],
    description: 'Search opportunities by name or description'
  },
  update_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: ['get_opportunity_details'],
    inputs: ['opportunity_id', 'updates'],
    outputs: ['opportunity'],
    effects: ['update'],
    description: 'Update opportunity fields'
  },
  delete_opportunity: {
    category: 'OPPORTUNITIES',
    dependencies: ['get_opportunity_details'],
    inputs: ['opportunity_id'],
    outputs: [],
    effects: ['delete'],
    description: 'Delete an opportunity'
  },

  // ========== SNAPSHOT ==========
  fetch_tenant_snapshot: {
    category: 'SNAPSHOT',
    dependencies: [],
    inputs: [],
    outputs: ['snapshot'],
    effects: ['read'],
    description: 'Get high-level CRM data summary'
  },
  debug_probe: {
    category: 'SNAPSHOT',
    dependencies: [],
    inputs: [],
    outputs: ['probe_result'],
    effects: ['read'],
    description: 'Debug probe for troubleshooting'
  },

  // Additional tool entries...
  // (Adding minimal set for analysis - full graph would include all tools from registry)
};

/**
 * Parameter order for each Braid function.
 * 
 * AUTO-GENERATED at module load time by parsing .braid files from
 * braid-llm-kit/examples/assistant/. This eliminates the maintenance risk
 * of a hand-maintained static map drifting out of sync with actual .braid
 * function signatures (Issue #4 from braid-refactoring-issues.md).
 * 
 * Falls back to an empty map if parsing fails (with a loud warning).
 * 
 * To inspect the generated map, run:
 *   node backend/scripts/generate-braid-param-order.js --check
 */
const BRAID_PARAM_ORDER = (() => {
  const order = {};
  try {
    const braidFiles = fs.readdirSync(ASSISTANT_DIR)
      .filter(f => f.endsWith('.braid'))
      .sort();

    let fnCount = 0;
    for (const file of braidFiles) {
      const filePath = path.join(ASSISTANT_DIR, file);
      const source = fs.readFileSync(filePath, 'utf8');
      try {
        const ast = parseBraid(source, file);
        for (const item of ast.items) {
          if (item.type === 'FnDecl') {
            order[item.name] = (item.params || []).map(p => p.name);
            fnCount++;
          }
        }
      } catch (parseErr) {
        console.error(`[Braid] ⚠️  Failed to parse ${file}: ${parseErr.message}`);
      }
    }

    console.log(`[Braid] ✅ Auto-generated BRAID_PARAM_ORDER: ${fnCount} functions from ${braidFiles.length} .braid files`);
  } catch (err) {
    console.error(`[Braid] ❌ Failed to auto-generate BRAID_PARAM_ORDER: ${err.message}`);
    console.error('[Braid]    Tool argument ordering may be incorrect. Check ASSISTANT_DIR path.');
  }
  return order;
})();

/**
 * Validate that all TOOL_REGISTRY functions have entries in BRAID_PARAM_ORDER.
 * Call at startup to catch missing entries early.
 * @returns {{ valid: boolean, missing: string[], extra: string[] }}
 */
export function validateParamOrderCoverage() {
  const registryFunctions = new Set(
    Object.values(TOOL_REGISTRY).map(config => config.function)
  );
  const paramOrderFunctions = new Set(Object.keys(BRAID_PARAM_ORDER));

  const missing = [];
  const extra = [];

  for (const fn of registryFunctions) {
    if (!paramOrderFunctions.has(fn)) {
      missing.push(fn);
    }
  }

  for (const fn of paramOrderFunctions) {
    if (!registryFunctions.has(fn)) {
      extra.push(fn);
    }
  }

  if (missing.length > 0) {
    console.warn(`[Braid] ⚠️  BRAID_PARAM_ORDER missing entries for: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.warn(`[Braid] ⚠️  BRAID_PARAM_ORDER has extra entries not in TOOL_REGISTRY: ${extra.join(', ')}`);
  }

  return { valid: missing.length === 0, missing, extra };
}

/**
 * Convert object args to positional array based on Braid function signature
 */
export function objectToPositionalArgs(toolName, argsObj) {
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

/**
 * Normalize tool arguments for consistent processing
 */
export function normalizeToolArgs(toolName, rawArgs, tenantRecord) {
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
export async function getToolImpactAnalysis(toolName) {
  const tool = TOOL_GRAPH[toolName];
  if (!tool) {
    return { error: `Unknown tool: ${toolName}` };
  }

  const dependents = getToolDependents(toolName);
  const dependencies = getToolDependencies(toolName);

  // Lazy import to break circular: execution → analysis → chains → execution
  const { TOOL_CHAINS } = await import('./chains.js');

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