/**
 * Status Card Label Resolver
 *
 * Tenants can rename status cards (e.g., "Warm", "Cold", "Nurture").
 * Tool calls must use the canonical status/card id stored in the database.
 *
 * This module builds fast lookup maps from the tenant context dictionary and
 * normalizes tool arguments before Braid tool execution.
 */

/**
 * Build a label->id lookup map for each entity from the tenant context dictionary.
 *
 * Expected dictionary shape (see tenantContextDictionary.js):
 *   dictionary.statusCards.entities = {
 *     leads: ["new", "contacted", ...] OR [{id, label, visible}, ...]
 *     ...
 *   }
 *
 * @param {Object|null} dictionary
 * @returns {Record<string, Record<string, string>>} map[entityType][labelLower] = id
 */
export function buildStatusLabelMap(dictionary) {
  const out = {};
  const entities = dictionary?.statusCards?.entities || {};

  for (const [entityType, cards] of Object.entries(entities)) {
    const m = {};

    if (Array.isArray(cards)) {
      for (const c of cards) {
        if (typeof c === 'string') {
          // Defaults: label == id
          m[c.toLowerCase()] = c;
        } else if (c && typeof c === 'object') {
          const id = c.id ? String(c.id) : null;
          const label = c.label ? String(c.label) : null;
          if (id) {
            // Map id to itself
            m[id.toLowerCase()] = id;
          }
          if (id && label) {
            m[label.toLowerCase()] = id;
          }
        }
      }
    }

    out[entityType] = m;
  }

  return out;
}

/**
 * Try to resolve a tenant-facing status label to a canonical status id.
 *
 * @param {Object} params
 * @param {Record<string, Record<string, string>>} params.statusLabelMap
 * @param {string} params.entityType - e.g. 'leads', 'opportunities', 'activities'
 * @param {string|null|undefined} params.status
 * @returns {string|null} canonical status id if resolved
 */
export function resolveStatusId({ statusLabelMap, entityType, status }) {
  if (!status || typeof status !== 'string') return null;
  const key = status.trim().toLowerCase();
  if (!key) return null;
  return statusLabelMap?.[entityType]?.[key] || null;
}

/**
 * Normalize tool arguments in-place.
 *
 * Currently supports:
 * - list_leads/search_leads: args.status -> canonical leads status id
 * - list_activities/search_activities: args.status -> canonical activities status id (if present)
 * - list_opportunities_by_stage/search_opportunities: args.stage/status -> canonical opportunity stage id (best effort)
 *
 * @param {Object} params
 * @param {string} params.toolName
 * @param {Object} params.args
 * @param {Record<string, Record<string, string>>} params.statusLabelMap
 * @returns {Object} args (same object reference)
 */
export function normalizeToolArgs({ toolName, args, statusLabelMap }) {
  if (!args || typeof args !== 'object') return args;

  // Leads
  if (toolName === 'list_leads' || toolName === 'search_leads') {
    const resolved = resolveStatusId({ statusLabelMap, entityType: 'leads', status: args.status });
    if (resolved) args.status = resolved;
  }

  // Activities (if your tools accept status)
  if (toolName === 'list_activities' || toolName === 'search_activities' || toolName === 'get_upcoming_activities') {
    const resolved = resolveStatusId({ statusLabelMap, entityType: 'activities', status: args.status });
    if (resolved) args.status = resolved;
  }

  // BizDev Sources (if status/filter ever present)
  if (toolName === 'list_bizdev_sources' || toolName === 'search_bizdev_sources') {
    const resolved = resolveStatusId({ statusLabelMap, entityType: 'bizdev_sources', status: args.status });
    if (resolved) args.status = resolved;
  }

  // Opportunities: tools may use stage or status naming
  if (
    toolName === 'list_opportunities_by_stage' ||
    toolName === 'search_opportunities' ||
    toolName === 'get_opportunity_forecast'
  ) {
    const stageKey = typeof args.stage === 'string' ? 'stage' : (typeof args.status === 'string' ? 'status' : null);
    if (stageKey) {
      const resolved = resolveStatusId({
        statusLabelMap,
        entityType: 'opportunities',
        status: args[stageKey],
      });
      if (resolved) args[stageKey] = resolved;
    }
  }

  // Contacts/Accounts sometimes have status cards too
  if (toolName === 'list_contacts_for_account' || toolName === 'search_contacts') {
    const resolved = resolveStatusId({ statusLabelMap, entityType: 'contacts', status: args.status });
    if (resolved) args.status = resolved;
  }
  if (toolName === 'list_accounts' || toolName === 'search_accounts') {
    const resolved = resolveStatusId({ statusLabelMap, entityType: 'accounts', status: args.status });
    if (resolved) args.status = resolved;
  }

  return args;
}
