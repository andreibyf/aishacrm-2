/**
 * upstreamTokens.js
 *
 * Resolves which data tokens are available to a given workflow node by
 * walking the graph forward from the trigger (BFS), collecting every node
 * that is an ancestor of the target, then emitting typed token descriptors
 * for each such upstream node.
 *
 * Token shape:
 *   { key, label, nodeId, nodeType, stepIndex, example? }
 *
 *   key        — the variable reference used in {{ }} templates
 *   label      — human-readable display string shown in the UI
 *   nodeId     — id of the node that produces this token
 *   nodeType   — type of the node that produces this token
 *   stepIndex  — 1-based execution order position of the producing node
 *   example    — optional sample value (populated from testPayload for trigger tokens)
 */

// ─── Entity field schemas ───────────────────────────────────────────────────
// Used by FieldMappingPanel to populate the target-field dropdown.
// Each entry: { value: db_column_name, label: display_label }

export const ENTITY_SCHEMAS = {
  lead: [
    { value: 'first_name',  label: 'First Name' },
    { value: 'last_name',   label: 'Last Name' },
    { value: 'email',       label: 'Email' },
    { value: 'phone',       label: 'Phone' },
    { value: 'company',     label: 'Company' },
    { value: 'status',      label: 'Status' },
    { value: 'source',      label: 'Source' },
    { value: 'address_1',   label: 'Address Line 1' },
    { value: 'address_2',   label: 'Address Line 2' },
    { value: 'city',        label: 'City' },
    { value: 'state',       label: 'State' },
    { value: 'zip',         label: 'Zip' },
    { value: 'country',     label: 'Country' },
    { value: 'notes',       label: 'Notes' },
    { value: 'assigned_to', label: 'Assigned To' },
  ],
  contact: [
    { value: 'first_name',  label: 'First Name' },
    { value: 'last_name',   label: 'Last Name' },
    { value: 'email',       label: 'Email' },
    { value: 'phone',       label: 'Phone' },
    { value: 'job_title',   label: 'Job Title' },
    { value: 'department',  label: 'Department' },
    { value: 'address_1',   label: 'Address Line 1' },
    { value: 'city',        label: 'City' },
    { value: 'state',       label: 'State' },
    { value: 'country',     label: 'Country' },
    { value: 'notes',       label: 'Notes' },
    { value: 'assigned_to', label: 'Assigned To' },
  ],
  account: [
    { value: 'name',        label: 'Company Name' },
    { value: 'industry',    label: 'Industry' },
    { value: 'website',     label: 'Website' },
    { value: 'phone',       label: 'Phone' },
    { value: 'email',       label: 'Email' },
    { value: 'address_1',   label: 'Address Line 1' },
    { value: 'city',        label: 'City' },
    { value: 'state',       label: 'State' },
    { value: 'country',     label: 'Country' },
    { value: 'status',      label: 'Status' },
    { value: 'assigned_to', label: 'Assigned To' },
  ],
  opportunity: [
    { value: 'name',        label: 'Opportunity Name' },
    { value: 'amount',      label: 'Amount' },
    { value: 'stage',       label: 'Stage' },
    { value: 'close_date',  label: 'Close Date' },
    { value: 'probability', label: 'Probability' },
    { value: 'description', label: 'Description' },
    { value: 'assigned_to', label: 'Assigned To' },
  ],
  activity: [
    { value: 'subject',     label: 'Subject' },
    { value: 'body',        label: 'Body / Details' },
    { value: 'status',      label: 'Status' },
    { value: 'due_date',    label: 'Due Date' },
    { value: 'assigned_to', label: 'Assigned To' },
    { value: 'type',        label: 'Activity Type' },
    { value: 'priority',    label: 'Priority' },
    { value: 'related_to',  label: 'Related Entity Type' },
    { value: 'related_id',  label: 'Related Entity ID' },
  ],
};

// ─── Node → token emission map ─────────────────────────────────────────────
// Maps node type → function(node, testPayload) → [{ key, label, example? }]
// The context variable prefix (found_lead, etc.) must match workflowExecutionService.

const NODE_TOKEN_EMITTERS = {
  webhook_trigger: (_node, testPayload) => {
    if (!testPayload || typeof testPayload !== 'object') return [];
    return Object.keys(testPayload).map((k) => ({
      key: k,
      label: k.replace(/_/g, ' '),
      example: testPayload[k],
    }));
  },

  care_trigger: (_node, testPayload) => {
    if (!testPayload || typeof testPayload !== 'object') return [];
    return Object.keys(testPayload).map((k) => ({
      key: k,
      label: k.replace(/_/g, ' '),
      example: testPayload[k],
    }));
  },

  find_lead: () =>
    ENTITY_SCHEMAS.lead.map(({ value, label }) => ({
      key: `found_lead.${value}`,
      label: `Lead → ${label}`,
    })),

  create_lead: () =>
    ENTITY_SCHEMAS.lead.map(({ value, label }) => ({
      key: `found_lead.${value}`,
      label: `Created Lead → ${label}`,
    })),

  update_lead: () =>
    ENTITY_SCHEMAS.lead.map(({ value, label }) => ({
      key: `found_lead.${value}`,
      label: `Updated Lead → ${label}`,
    })),

  find_contact: () =>
    ENTITY_SCHEMAS.contact.map(({ value, label }) => ({
      key: `found_contact.${value}`,
      label: `Contact → ${label}`,
    })),

  update_contact: () =>
    ENTITY_SCHEMAS.contact.map(({ value, label }) => ({
      key: `found_contact.${value}`,
      label: `Updated Contact → ${label}`,
    })),

  find_account: () =>
    ENTITY_SCHEMAS.account.map(({ value, label }) => ({
      key: `found_account.${value}`,
      label: `Account → ${label}`,
    })),

  update_account: () =>
    ENTITY_SCHEMAS.account.map(({ value, label }) => ({
      key: `found_account.${value}`,
      label: `Updated Account → ${label}`,
    })),

  create_opportunity: () =>
    ENTITY_SCHEMAS.opportunity.map(({ value, label }) => ({
      key: `found_opportunity.${value}`,
      label: `Created Opp → ${label}`,
    })),

  update_opportunity: () =>
    ENTITY_SCHEMAS.opportunity.map(({ value, label }) => ({
      key: `found_opportunity.${value}`,
      label: `Updated Opp → ${label}`,
    })),

  create_activity: () =>
    ENTITY_SCHEMAS.activity.map(({ value, label }) => ({
      key: `created_activity.${value}`,
      label: `Activity → ${label}`,
    })),

  http_request: () => [
    { key: 'last_http_status',   label: 'HTTP → Status Code' },
    { key: 'last_http_response', label: 'HTTP → Response Body' },
  ],

  pep_query: () => [
    { key: 'pep_results.rows',  label: 'PEP → Result Rows' },
    { key: 'pep_results.count', label: 'PEP → Result Count' },
  ],
};

// ─── BFS: forward-reachable ancestors ──────────────────────────────────────

/**
 * Returns an ordered list of node IDs that are ancestors of targetNodeId,
 * in forward BFS execution order (trigger → target, exclusive of target).
 *
 * Strategy:
 *   1. Backward BFS from target  → builds the ancestor set
 *   2. Forward BFS from triggers → emits ancestors in execution order
 *
 * @param {string}   targetNodeId
 * @param {object[]} nodes
 * @param {object[]} connections  [{ from, to }]
 * @returns {{ id: string, stepIndex: number }[]}
 */
function getUpstreamExecutionOrder(targetNodeId, nodes, connections) {
  // Build adjacency lists
  const fwdAdj = {};
  const backAdj = {};
  for (const { from, to } of connections) {
    if (!fwdAdj[from]) fwdAdj[from] = [];
    fwdAdj[from].push(to);
    if (!backAdj[to]) backAdj[to] = [];
    backAdj[to].push(from);
  }

  // Step 1: ancestor set via backward BFS from target (target excluded)
  const ancestors = new Set();
  const backVisited = new Set([targetNodeId]);
  const backQueue = [...(backAdj[targetNodeId] || [])];
  for (const id of backQueue) backVisited.add(id);
  while (backQueue.length) {
    const cur = backQueue.shift();
    ancestors.add(cur);
    for (const pred of (backAdj[cur] || [])) {
      if (!backVisited.has(pred)) {
        backVisited.add(pred);
        backQueue.push(pred);
      }
    }
  }

  // Step 2: identify trigger roots (explicit trigger types, or nodes with no incoming edge)
  const triggerTypes = new Set(['webhook_trigger', 'care_trigger']);
  const hasIncoming = new Set(connections.map((c) => c.to));
  const roots = nodes
    .filter((n) => triggerTypes.has(n.type) || !hasIncoming.has(n.id))
    .map((n) => n.id);

  // Step 3: forward BFS from roots, emit only ancestor nodes in order
  const result = [];
  const fwdVisited = new Set();
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift();
    if (fwdVisited.has(cur)) continue;
    fwdVisited.add(cur);
    if (ancestors.has(cur)) result.push(cur);
    for (const next of (fwdAdj[cur] || [])) {
      if (!fwdVisited.has(next)) queue.push(next);
    }
  }

  return result.map((id, idx) => ({ id, stepIndex: idx + 1 }));
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Returns all tokens available to `targetNodeId` from its upstream nodes.
 *
 * @param {string}       targetNodeId
 * @param {object[]}     nodes        — full workflow node array
 * @param {object[]}     connections  — full workflow connection array [{ from, to }]
 * @param {object|null}  testPayload  — sample webhook payload (for trigger tokens)
 * @returns {object[]}   array of token descriptors
 */
export function getUpstreamTokens(targetNodeId, nodes, connections, testPayload) {
  const ordered = getUpstreamExecutionOrder(targetNodeId, nodes, connections);
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const tokens = [];

  for (const { id, stepIndex } of ordered) {
    const node = nodeById[id];
    if (!node) continue;

    const emitter = NODE_TOKEN_EMITTERS[node.type];
    if (!emitter) continue; // silently skip unknown node types

    for (const descriptor of emitter(node, testPayload)) {
      tokens.push({ ...descriptor, nodeId: node.id, nodeType: node.type, stepIndex });
    }
  }

  return tokens;
}

/**
 * Wraps a bare token key in {{ }} for use in template strings.
 * Already-wrapped keys are returned as-is. Falsy input returns ''.
 *
 * @param {string|null|undefined} key
 * @returns {string}
 */
export function tokenToTemplate(key) {
  if (!key) return '';
  if (key.startsWith('{{') && key.endsWith('}}')) return key;
  return `{{${key}}}`;
}
