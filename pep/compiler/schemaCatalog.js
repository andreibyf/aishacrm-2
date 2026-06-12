/**
 * Schema-derived field catalog for PEP queries.
 *
 * Instead of hand-listing every queryable field per entity in entity-catalog.yaml
 * (which silently drifts from the real schema — the cause of "Contact has no
 * phone field" even though the column exists), the field list for each entity is
 * derived from the LIVE table columns, minus a global denylist of internal /
 * sensitive columns. The YAML still owns the entity LIST + table/route bindings;
 * its `fields` entries (if any) become operator overrides.
 *
 * Schema is tenant-agnostic, so the derived catalog is cached process-wide.
 * Restart picks up new columns.
 */
import { getSupabaseAdmin } from '../../backend/lib/supabaseFactory.js';

// Columns customers must never filter, sort, or see in a report.
// Exact names + name patterns. `tenant_id` is mandatory (tenant isolation);
// anything "metadata" is denied per product decision; embeddings + legacy jsonb
// dumps are internal noise.
const DENY_EXACT = new Set(['tenant_id']);
const DENY_PATTERNS = [/metadata/i, /embedding/i, /_jsonb(_old)?$/i];

export function isDeniedColumn(col) {
  const name = String(col || '');
  if (DENY_EXACT.has(name)) return true;
  return DENY_PATTERNS.some((re) => re.test(name));
}

function inferType(name, value) {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (/(_at|_date)$/i.test(name) || /^date_/i.test(name)) return 'date';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  return 'string';
}

function operatorsFor(type) {
  switch (type) {
    case 'number':
    case 'date':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'];
    case 'boolean':
      return ['eq', 'neq', 'is_null', 'is_not_null'];
    default:
      return ['eq', 'neq', 'contains', 'in', 'is_null', 'is_not_null'];
  }
}

/**
 * Derive the queryable fields for a table from a sample row's columns.
 * @param {string} table
 * @param {Record<string, {operators?: string[]}>} [overrides] - YAML field entries (lowercased keys)
 * @returns {Promise<Array<{name,type,operators}>|null>} null when the table is empty/unknown
 */
export async function deriveTableFields(table, overrides = {}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from(table).select('*').limit(1);
  if (error || !data || !data.length) return null;
  const row = data[0];
  return Object.keys(row)
    .filter((c) => !isDeniedColumn(c))
    .map((name) => {
      const type = inferType(name, row[name]);
      const ov = overrides[name.toLowerCase()];
      return { name, type, operators: ov?.operators || operatorsFor(type) };
    });
}

let _cache = null;

/**
 * Build an effective catalog: entity bindings from YAML, fields auto-derived from
 * the live schema (minus the denylist). Falls back to the YAML `fields` for a
 * table that's empty or unreadable. Views pass through unchanged. Cached.
 *
 * @param {object} baseCatalog - parsed entity-catalog.yaml
 * @returns {Promise<object>} effective catalog with derived entity.fields
 */
export async function buildEffectiveCatalog(baseCatalog) {
  if (_cache) return _cache;
  const entities = [];
  for (const e of baseCatalog.entities || []) {
    const table = e.aisha_binding?.table;
    const overrides = {};
    for (const f of e.fields || []) overrides[String(f.name).toLowerCase()] = f;
    let fields = null;
    if (table) {
      try {
        fields = await deriveTableFields(table, overrides);
      } catch {
        fields = null;
      }
    }
    if (!fields || !fields.length) fields = e.fields || []; // fallback to YAML
    entities.push({ ...e, fields });
  }
  _cache = { ...baseCatalog, entities };
  return _cache;
}

/** Test/maintenance hook — clear the cached effective catalog. */
export function _clearCatalogCache() {
  _cache = null;
}
