/**
 * upstreamTokens.js
 *
 * Given a target node ID and the full nodes/connections array, walks the
 * execution graph backwards and returns a flat list of all variable tokens
 * that are available to that node.
 *
 * Token shape:
 *  {
 *    key:       string  – the variable key to embed, e.g. "email" or "found_lead.first_name"
 *    label:     string  – human label, e.g. "email" or "found_lead · first_name"
 *    stepIndex: number  – 1-based position of the source node in execution order
 *    stepLabel: string  – human name of the source node
 *    nodeType:  string  – e.g. "webhook_trigger"
 *    example:   any     – optional example value from testPayload
 *  }
 *
 * Variable resolution rules (mirrors backend replaceVariables):
 *  - webhook_trigger fields  → "{{fieldName}}"
 *  - find_lead / create_lead → "{{found_lead.fieldName}}"
 *  - find_contact            → "{{found_contact.fieldName}}"
 *  - find_account            → "{{found_account.fieldName}}"
 *  - find_opportunity        → "{{found_opportunity.fieldName}}"
 *  - create_activity         → "{{created_activity.fieldName}}"
 *  - http_request            → "{{last_http_response}}", "{{last_http_status}}"
 *  - ai_* nodes              → "{{ai_stage.stage}}", etc.
 */

// Static field definitions per node type (mirrors generateNodeOutputPreview)
const NODE_OUTPUT_FIELDS = {
  webhook_trigger: {
    label: 'Webhook Trigger',
    prefix: null, // fields come directly from testPayload keys
    fields: [], // populated dynamically from testPayload
  },
  find_lead: {
    label: 'Find Lead',
    prefix: 'found_lead',
    fields: [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'company',
      'status',
      'score',
      'job_title',
      'source',
      'notes',
    ],
  },
  create_lead: {
    label: 'Create Lead',
    prefix: 'found_lead',
    fields: [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'company',
      'status',
      'job_title',
      'source',
    ],
  },
  update_lead: {
    label: 'Update Lead',
    prefix: 'found_lead',
    fields: ['id', 'first_name', 'last_name', 'email', 'phone', 'company', 'status'],
  },
  find_contact: {
    label: 'Find Contact',
    prefix: 'found_contact',
    fields: ['id', 'first_name', 'last_name', 'email', 'phone', 'company', 'account_id'],
  },
  update_contact: {
    label: 'Update Contact',
    prefix: 'found_contact',
    fields: ['id', 'first_name', 'last_name', 'email', 'phone'],
  },
  find_account: {
    label: 'Find Account',
    prefix: 'found_account',
    fields: ['id', 'name', 'industry', 'website', 'email', 'phone'],
  },
  update_account: {
    label: 'Update Account',
    prefix: 'found_account',
    fields: ['id', 'name', 'industry', 'website'],
  },
  find_opportunity: {
    label: 'Find Opportunity',
    prefix: 'found_opportunity',
    fields: ['id', 'name', 'amount', 'stage', 'close_date'],
  },
  create_opportunity: {
    label: 'Create Opportunity',
    prefix: 'found_opportunity',
    fields: ['id', 'name', 'amount', 'stage', 'close_date'],
  },
  update_opportunity: {
    label: 'Update Opportunity',
    prefix: 'found_opportunity',
    fields: ['id', 'name', 'amount', 'stage'],
  },
  create_activity: {
    label: 'Create Activity',
    prefix: 'created_activity',
    fields: [
      'id',
      'type',
      'subject',
      'body',
      'status',
      'due_date',
      'assigned_to',
      'related_id',
      'related_to',
    ],
  },
  http_request: {
    label: 'HTTP Request',
    prefix: null,
    fields: ['last_http_status', 'last_http_response'],
  },
  ai_classify_opportunity_stage: {
    label: 'AI: Classify Stage',
    prefix: 'ai_stage',
    fields: ['stage', 'confidence', 'reasoning'],
  },
  ai_generate_email: {
    label: 'AI: Generate Email',
    prefix: 'ai_email',
    fields: ['subject', 'body', 'tone'],
  },
  ai_enrich_account: {
    label: 'AI: Enrich Account',
    prefix: 'ai_enrichment',
    fields: ['industry', 'size', 'description', 'technologies'],
  },
  ai_route_activity: {
    label: 'AI: Route Activity',
    prefix: 'ai_route',
    fields: ['assigned_to', 'priority', 'reasoning'],
  },
  ai_summarize: {
    label: 'AI Summarize',
    prefix: 'ai_summary',
    fields: ['summary', 'key_points'],
  },
  pep_query: {
    label: 'PEP Query',
    prefix: 'pep_results',
    fields: ['results', 'count'],
  },
};

/**
 * Topological walk: returns nodes in execution order up to (but not including)
 * the targetNodeId. Handles linear and branching graphs.
 */
function getExecutionOrderBefore(targetNodeId, nodes, connections) {
  // Build adjacency: from → [to]
  const adj = {};
  for (const c of connections) {
    if (!adj[c.from]) adj[c.from] = [];
    adj[c.from].push(c.to);
  }

  // Find start node (trigger – no incoming connections)
  const hasIncoming = new Set(connections.map((c) => c.to));
  const startNodes = nodes.filter((n) => !hasIncoming.has(n.id));
  if (!startNodes.length) return [];

  // BFS to collect all ancestors of targetNodeId
  const ancestors = [];
  const visited = new Set();
  const queue = [...startNodes.map((n) => n.id)];

  while (queue.length) {
    const id = queue.shift();
    if (id === targetNodeId) continue; // don't include target itself
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node) ancestors.push(node);
    const nexts = adj[id] || [];
    for (const next of nexts) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return ancestors;
}

/**
 * Build a list of upstream tokens available to a given node.
 *
 * @param {string}  targetNodeId
 * @param {Array}   nodes          – full workflow nodes array
 * @param {Array}   connections    – full workflow connections array
 * @param {object}  testPayload    – the captured webhook payload (or null)
 * @returns {Array<Token>}
 */
export function getUpstreamTokens(targetNodeId, nodes, connections, testPayload) {
  const ancestors = getExecutionOrderBefore(targetNodeId, nodes, connections);
  const tokens = [];

  ancestors.forEach((node, idx) => {
    const stepIndex = idx + 1;
    const def = NODE_OUTPUT_FIELDS[node.type];
    if (!def) return;

    const stepLabel = def.label;

    if (node.type === 'webhook_trigger') {
      // Dynamic: use testPayload keys if available, else show nothing
      const payloadKeys = testPayload ? Object.keys(testPayload) : [];
      for (const field of payloadKeys) {
        tokens.push({
          key: field,
          label: field,
          stepIndex,
          stepLabel,
          nodeType: node.type,
          example: testPayload[field],
        });
      }
      return;
    }

    if (node.type === 'http_request') {
      tokens.push({
        key: 'last_http_status',
        label: 'HTTP Status Code',
        stepIndex,
        stepLabel,
        nodeType: node.type,
        example: 200,
      });
      tokens.push({
        key: 'last_http_response',
        label: 'HTTP Response Body',
        stepIndex,
        stepLabel,
        nodeType: node.type,
        example: '{"success":true}',
      });
      return;
    }

    const prefix = def.prefix;
    for (const field of def.fields) {
      const key = prefix ? `${prefix}.${field}` : field;
      tokens.push({
        key,
        label: prefix ? `${prefix} · ${field}` : field,
        stepIndex,
        stepLabel,
        nodeType: node.type,
        example: undefined,
      });
    }
  });

  return tokens;
}

/**
 * Convert a token key to a {{variable}} template string.
 * e.g. "found_lead.email" → "{{found_lead.email}}"
 *      "email"            → "{{email}}"
 */
export function tokenToTemplate(key) {
  if (!key) return '';
  // If already a template string, return as-is
  if (key.startsWith('{{') && key.endsWith('}}')) return key;
  return `{{${key}}}`;
}

/**
 * Schema definitions for each entity's writable fields.
 * Used by FieldMappingPanel targetSchema prop.
 */
export const ENTITY_SCHEMAS = {
  lead: [
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
    { value: 'job_title', label: 'Job Title' },
    { value: 'status', label: 'Status' },
    { value: 'score', label: 'Score' },
    { value: 'source', label: 'Source' },
    { value: 'next_action', label: 'Next Action' },
    { value: 'notes', label: 'Notes' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'country', label: 'Country' },
    { value: 'assigned_to', label: 'Assigned To (User ID)' },
  ],
  contact: [
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'job_title', label: 'Job Title' },
    { value: 'company', label: 'Company' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'country', label: 'Country' },
    { value: 'notes', label: 'Notes' },
    { value: 'assigned_to', label: 'Assigned To (User ID)' },
  ],
  account: [
    { value: 'name', label: 'Name' },
    { value: 'industry', label: 'Industry' },
    { value: 'website', label: 'Website' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'country', label: 'Country' },
    { value: 'annual_revenue', label: 'Annual Revenue' },
    { value: 'employee_count', label: 'Employee Count' },
    { value: 'notes', label: 'Notes' },
  ],
  opportunity: [
    { value: 'name', label: 'Name' },
    { value: 'amount', label: 'Amount' },
    { value: 'stage', label: 'Stage' },
    { value: 'probability', label: 'Probability' },
    { value: 'close_date', label: 'Close Date' },
    { value: 'notes', label: 'Notes' },
  ],
  activity: [
    { value: 'type', label: 'Type' },
    { value: 'subject', label: 'Subject / Title' },
    { value: 'body', label: 'Body / Details' },
    { value: 'status', label: 'Status' },
    { value: 'due_date', label: 'Due Date' },
    { value: 'assigned_to', label: 'Assigned To (User ID)' },
    { value: 'related_to', label: 'Related To (entity type)' },
    { value: 'related_id', label: 'Related ID' },
  ],
};
