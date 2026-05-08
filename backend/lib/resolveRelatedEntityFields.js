// @ts-check
/**
 * Shared helper for activity row inserts: resolve `related_name` (+ `related_email`)
 * for a given (related_to, related_id) by reading the linked entity.
 *
 * Why this exists (4VD-39): the Activities page and detail-panel timelines
 * render the related-entity hyperlink using `activity.related_name`, falling
 * back to "View Contact" / "View Lead" / etc. when null. Routes that insert
 * activity rows but don't pre-resolve the name leave that hyperlink reading
 * "View Contact" instead of the actual person/company name.
 *
 * The pattern is already established in:
 *   - backend/routes/calcom-webhook.js          — sets related_name from attendeeName
 *   - backend/routes/activities.v2.js           — sets related_name from request body
 *   - backend/services/workflowExecutionService — resolves at workflow runtime
 *   - backend/scripts/migrations/fix-orphaned-relationships.js — backfill loop
 *
 * This helper consolidates the entity → display-name lookup so future routes
 * can reuse it without re-implementing the per-entity name-field logic
 * (lead/contact use first_name+last_name; account/opportunity use a single name).
 *
 * Returns `{ related_name, related_email }` with both possibly null. Never
 * throws — degrades to nulls on lookup failure, since the activity insert
 * should still proceed (the hyperlink fallback "View Contact" is acceptable
 * if the lookup hiccups; a thrown error would block the whole insert).
 */

const ENTITY_FIELD_MAP = {
  lead: { table: 'leads', nameFields: ['first_name', 'last_name'], emailField: 'email' },
  contact: { table: 'contacts', nameFields: ['first_name', 'last_name'], emailField: 'email' },
  account: { table: 'accounts', nameFields: ['name'], emailField: 'email' },
  opportunity: { table: 'opportunities', nameFields: ['name'], emailField: null },
  bizdev_source: {
    table: 'bizdev_sources',
    nameFields: ['first_name', 'last_name'],
    emailField: 'email',
  },
};

/**
 * @param {object} entity - the row returned from supabase
 * @param {string[]} nameFields - one or two columns whose values compose the display name
 * @returns {string} the display name (trimmed, possibly empty)
 */
function composeDisplayName(entity, nameFields) {
  if (!entity) return '';
  if (nameFields.length === 1) {
    return String(entity[nameFields[0]] || '').trim();
  }
  // Two-field case: first_name + last_name. Skip empty halves cleanly so a
  // contact with only last_name doesn't render as " Doe".
  return [entity[nameFields[0]], entity[nameFields[1]]]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter((s) => s.length > 0)
    .join(' ');
}

/**
 * Resolve the activity-row friendly fields for a related entity.
 *
 * @param {object} supabase - service-role supabase client
 * @param {string} tenantId - tenant uuid (also used as RLS-bypass safety check;
 *                            queries are explicit-tenant-scoped to avoid cross-
 *                            tenant reads if the caller passes a stray id)
 * @param {string} relatedTo - 'lead' | 'contact' | 'account' | 'opportunity' | 'bizdev_source'
 * @param {string} relatedId - the entity uuid
 * @returns {Promise<{related_name: string|null, related_email: string|null}>}
 */
export async function resolveRelatedEntityFields(supabase, tenantId, relatedTo, relatedId) {
  const empty = { related_name: null, related_email: null };
  if (!supabase || !tenantId || !relatedTo || !relatedId) return empty;

  const cfg = ENTITY_FIELD_MAP[relatedTo];
  if (!cfg) return empty;

  const selectCols = [...cfg.nameFields, cfg.emailField].filter(Boolean).join(', ');

  try {
    const { data, error } = await supabase
      .from(cfg.table)
      .select(selectCols)
      .eq('tenant_id', tenantId)
      .eq('id', relatedId)
      .maybeSingle();
    if (error || !data) return empty;

    const name = composeDisplayName(data, cfg.nameFields);
    const email = cfg.emailField ? data[cfg.emailField] || null : null;
    return {
      related_name: name || null,
      related_email: typeof email === 'string' && email.length > 0 ? email : null,
    };
  } catch {
    return empty;
  }
}

export { composeDisplayName, ENTITY_FIELD_MAP };
