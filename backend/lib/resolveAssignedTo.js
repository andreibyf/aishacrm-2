// @ts-check
/**
 * resolveAssignedTo (4VD-44 — extracted from activities.v2.js so it can be
 * unit-tested in isolation AND reused by signingActivityTracker.js, which
 * had its own near-duplicate `resolveAssignedEmployee` for the same job).
 *
 * Why this exists
 * ===============
 * `public.activities.assigned_to` is a UUID FK to `public.employees(id)`.
 * Frontend Activity API consumers (Calendar, Activities timeline filter,
 * Reports filters) frequently pass an EMAIL value via the `assigned_to`
 * filter — particularly the Calendar's "show me my own" non-admin path
 * which uses `currentUser.email`. Routes need to translate that email
 * to the matching employees.id for the same tenant before applying the
 * `.eq('assigned_to', ...)` filter.
 *
 * Critical bug fixed here (4VD-44)
 * ================================
 * The previous version had a fallback to the `users` table when the
 * email had no matching employee row. That fallback returned a
 * `users.id` UUID which is NOT a valid value for `activities.assigned_to`
 * (which FKs to employees, not users). The helper "succeeded" with a
 * type-incompatible value, masking the underlying mismatch:
 *   - on INSERT/UPDATE: triggered an FK violation (silently caught
 *     upstream → no row inserted)
 *   - on SELECT filter: matched zero rows because no
 *     activities.assigned_to ever holds a users.id value
 * Symptom: non-admin user opens Calendar → empty.
 *
 * Fix: ONLY look up the employees table. Return its id or null. Never
 * return a users.id. The caller is responsible for deciding what to do
 * when the helper returns null (typical patterns: bypass the filter,
 * surface "no matching employee" to the user, or stamp NULL on the row).
 *
 * @param {object} supabase  service-role supabase client
 * @param {string} tenantId  tenant uuid (filter scope)
 * @param {string|null|undefined} assignedTo   UUID, email, or falsy
 * @returns {Promise<string|null>}  employees.id or null
 */
export async function resolveAssignedTo(supabase, tenantId, assignedTo) {
  if (!assignedTo) return null;
  if (typeof assignedTo !== 'string') return null;

  // If it's already a valid UUID, return it directly. We trust the caller
  // (route handler) to have validated it upstream — the FK on
  // activities.assigned_to will reject any non-employee UUID at INSERT.
  if (UUID_REGEX.test(assignedTo)) return assignedTo;

  // Email path. Case-insensitive match — emails are case-insensitive per
  // RFC 5321 §2.4.
  if (assignedTo.includes('@')) {
    const normalizedEmail = assignedTo.toLowerCase().trim();
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('email', normalizedEmail)
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data?.id || null;
    } catch {
      return null;
    }
  }

  return null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
