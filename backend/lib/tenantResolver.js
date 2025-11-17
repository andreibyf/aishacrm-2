// Utility to normalize a tenant identifier from UUID to slug used in legacy tables
// If given a slug, returns it unchanged.

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUUID(val) {
  return typeof val === 'string' && UUID_RE.test(val.trim());
}

// Resolve a tenant "slug" used in legacy tenant_id columns from a provided identifier which may be UUID or slug
// Strategy:
// - If identifier is a UUID: look up tenant.domain and tenant.name, and derive a slug compatible with legacy tables
//   Rules:
//     • If domain contains a dot (e.g., "labor-depot.com"), use the part before the first dot ("labor-depot")
//     • Else if domain has no dot, use domain as-is
//     • Else fall back to name
//   Then slugify: lowercase, remove non [a-z0-9\s-], collapse spaces/underscores to '-', collapse multiple '-'
// - If identifier is already a plausible slug, return as-is.
export async function resolveTenantSlug(pgPool, identifier) {
  if (!identifier || typeof identifier !== 'string') return identifier;
  const id = identifier.trim();
  if (!isUUID(id)) return id; // assume already slug

  try {
    const result = await pgPool.query(
      `SELECT TRIM(domain) as domain, name
         FROM tenant
        WHERE id = $1
        LIMIT 1`,
      [id]
    );
    const row = result.rows?.[0] || {};
    let basis = '';
    const domain = (row.domain || '').trim();
    const name = (row.name || '').trim();

    if (domain) {
      // If domain has a TLD, take the part before the first dot ("labor-depot.com" -> "labor-depot")
      basis = domain.includes('.') ? domain.split('.')[0] : domain;
    } else if (name) {
      basis = name;
    }

    if (!basis) return id; // fallback: return original so callers can decide

    const slug = String(basis)
      .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '') // drop dots/underscores and unusual chars
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || id;
  } catch {
    return id;
  }
}
