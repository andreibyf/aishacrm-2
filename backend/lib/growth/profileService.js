/**
 * profileService — business_profiles helpers (OSINT Opportunity Intelligence, Phase 1).
 *
 * A business_profile is the manually-declared scope (services × regions) that an
 * insight run reasons over. There is exactly one row per tenant
 * (business_profiles UNIQUE(tenant_id)). When a tenant has none yet, we seed one
 * from the tenant's own declared fields so the feature is usable on first open.
 *
 * Tenant isolation: every query filters by the caller-supplied tenantId (a UUID
 * from req.tenant.id). The tenant_id is always stamped from that context on
 * insert and is NEVER accepted from client input on update.
 *
 * The Supabase client is injected so this module is pure-unit testable with a
 * fake client (no live DB / network).
 */

// Keys a client is allowed to write on a business_profile.
const WRITABLE_FIELDS = [
  'service_catalog',
  'target_regions',
  'tracked_keywords',
  'competitors',
  'settings',
];

// Tenant fields mirrored into the seed profile's `settings`.
const SEED_SETTING_FIELDS = ['industry', 'business_model', 'geographic_focus'];

/**
 * Build a seed business_profile from a tenant row. PURE — no DB, no side effects.
 *
 * @param {object} tenant - tenant row (industry, business_model, geographic_focus, country, major_city)
 * @returns {{service_catalog:Array, target_regions:Array, tracked_keywords:Array, competitors:Array, settings:object}}
 */
export function buildSeedProfile(tenant = {}) {
  const { country, major_city } = tenant;

  let target_regions = [];
  if (major_city && country) {
    target_regions = [{ type: 'city', name: `${major_city}, ${country}` }];
  } else if (country) {
    target_regions = [{ type: 'country', name: country }];
  }

  const settings = {};
  for (const key of SEED_SETTING_FIELDS) {
    if (tenant[key]) settings[key] = tenant[key];
  }

  return {
    service_catalog: [],
    target_regions,
    tracked_keywords: [],
    competitors: [],
    settings,
  };
}

/**
 * Whitelist a client patch down to the writable business_profile fields,
 * dropping any other keys (tenant_id, id, arbitrary input).
 *
 * @param {object} patch
 * @returns {object}
 */
function sanitizeProfilePatch(patch = {}) {
  const clean = {};
  for (const key of WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      clean[key] = patch[key];
    }
  }
  return clean;
}

/**
 * Fetch the tenant's business_profile; if none exists, seed one from the tenant
 * row, insert it, and return the inserted row.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tenantId - tenant UUID (req.tenant.id)
 * @returns {Promise<object>} the existing or newly-seeded profile row
 */
export async function getOrSeedProfile(supabase, tenantId) {
  const { data: existing, error: fetchError } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data: tenant, error: tenantError } = await supabase
    .from('tenant')
    .select('industry, business_model, geographic_focus, country, major_city')
    .eq('id', tenantId)
    .single();

  if (tenantError) throw tenantError;

  const seed = buildSeedProfile(tenant || {});

  const { data: inserted, error: insertError } = await supabase
    .from('business_profiles')
    .insert({ tenant_id: tenantId, ...seed })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return inserted;
}

/**
 * Update the tenant's business_profile with a whitelisted patch. Any key outside
 * WRITABLE_FIELDS (including tenant_id / id) is dropped.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tenantId - tenant UUID (req.tenant.id)
 * @param {object} patch - client-supplied fields
 * @returns {Promise<object>} the updated profile row
 */
export async function saveProfile(supabase, tenantId, patch) {
  const clean = sanitizeProfilePatch(patch);

  const { data: updated, error } = await supabase
    .from('business_profiles')
    .update(clean)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (error) throw error;
  return updated;
}
