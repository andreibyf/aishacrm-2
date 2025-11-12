/**
 * Canonical user normalization.
 * Accepts a raw user object potentially containing duplicated fields:
 *  - top-level vs user_metadata (first_name, last_name, display_name, role, branding_settings, etc.)
 *  - permissions as array OR object (backend evolution)
 *  - tenant_id possibly null for superadmin/global users
 * Returns a stable, minimal, enriched shape consumed across the app.
 *
 * Canonical Shape (TypeScript style for clarity):
 * interface CanonicalUser {
 *   id: string;
 *   email: string;
 *   role: string;              // lowercased
 *   is_superadmin: boolean;
 *   tenant_id: string | null;  // null means global scope; superadmin must choose active tenant for tenant-scoped ops
 *   employee_id?: string;
 *   first_name?: string;
 *   last_name?: string;
 *   full_name?: string;
 *   display_name?: string;
 *   branding_settings?: {
 *     accentColor?: string;
 *     companyName?: string;
 *     footerLogoUrl?: string;
 *     logoUrl?: string;
 *     primaryColor?: string;
 *   };
 *   navigation_permissions: Record<string, boolean>;
 *   permissions: {
 *     access_level?: string;          // e.g. 'read_only' | 'read_write'
 *     crm_access?: boolean;
 *     dashboard_scope?: string;       // e.g. 'aggregated'
 *     intended_role?: string;         // planned promotion or requested role
 *     can_use_softphone?: boolean;
 *     can_manage_users?: boolean;
 *     can_manage_settings?: boolean;
 *   };
 *   status?: string;                  // inactive | active | suspended etc.
 *   live_status?: string;             // online | offline etc.
 *   last_seen?: string;               // ISO timestamp
 *   created_at?: string;
 *   updated_at?: string;
 * }
 */

const WARN_ONCE_FLAGS = {
  duplicateMetadata: false,
  permissionsTypeMismatch: false,
};

export function normalizeUser(raw) {
  if (!raw) return null;

  // Prefer top-level then user_metadata fallback
  const meta = raw.user_metadata || {};

  // Consolidate names
  const firstName = raw.first_name || meta.first_name || undefined;
  const lastName = raw.last_name || meta.last_name || undefined;
  const displayName = raw.display_name || meta.display_name || (raw.full_name || meta.full_name) || [firstName, lastName].filter(Boolean).join(' ') || undefined;
  const fullName = raw.full_name || meta.full_name || displayName || undefined;

  // Role normalization
  const role = (raw.role || meta.role || '').toLowerCase();
  const isSuperadmin = role === 'superadmin';

  // Tenant ID precedence: explicit raw.tenant_id -> metadata.tenant_id -> null
  const tenantId = raw.tenant_id != null ? raw.tenant_id : (meta.tenant_id != null ? meta.tenant_id : null);

  // Permissions may appear as array OR object. Unify to object.
  let permissions = raw.permissions || meta.permissions || {};
  if (Array.isArray(permissions)) {
    if (!WARN_ONCE_FLAGS.permissionsTypeMismatch && import.meta?.env?.DEV) {
      console.warn('[normalizeUser] permissions provided as array; converting to object.');
      WARN_ONCE_FLAGS.permissionsTypeMismatch = true;
    }
    const converted = {};
    permissions.forEach(p => { converted[p] = true; });
    permissions = converted;
  }

  // Merge granular permission flags scattered on raw/meta into permissions object if absent.
  const mergedPermissions = {
    access_level: raw.access_level || meta.access_level || permissions.access_level,
    crm_access: (raw.crm_access !== undefined ? raw.crm_access : meta.crm_access) ?? permissions.crm_access ?? false,
    dashboard_scope: raw.dashboard_scope || meta.dashboard_scope || permissions.dashboard_scope,
    intended_role: raw.intended_role || meta.intended_role || permissions.intended_role,
    can_use_softphone: (raw.can_use_softphone ?? meta.can_use_softphone ?? permissions.can_use_softphone) || false,
    can_manage_users: (raw.can_manage_users ?? meta.can_manage_users ?? permissions.can_manage_users) || false,
    can_manage_settings: (raw.can_manage_settings ?? meta.can_manage_settings ?? permissions.can_manage_settings) || false,
  };

  // Navigation permissions: ensure object
  const navigationPermissions = raw.navigation_permissions || meta.navigation_permissions || {};

  // Branding settings
  const brandingSettings = raw.branding_settings || meta.branding_settings || undefined;
  const systemOpenAISettings = raw.system_openai_settings || meta.system_openai_settings || undefined;
  const systemStripeSettings = raw.system_stripe_settings || meta.system_stripe_settings || undefined;

  // Live status / last seen
  const live_status = raw.live_status || meta.live_status || undefined;
  const last_seen = raw.last_seen || meta.last_seen || undefined;

  // Employee ID precedence
  const employeeId = raw.employee_id || raw.id_if_employee || undefined;

  // Warn once about duplicate top-level vs metadata usage (heuristic)
  if (!WARN_ONCE_FLAGS.duplicateMetadata && import.meta?.env?.DEV) {
    const dupKeys = ['first_name','last_name','display_name','role','tenant_id'].filter(k => raw[k] && meta[k]);
    if (dupKeys.length) {
      console.warn('[normalizeUser] Duplicate keys in raw & user_metadata detected:', dupKeys);
      WARN_ONCE_FLAGS.duplicateMetadata = true;
    }
  }

  return {
    id: raw.id,
    email: raw.email,
    role,
    is_superadmin: isSuperadmin,
    tenant_id: tenantId,
    employee_id: employeeId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    display_name: displayName,
    branding_settings: brandingSettings,
  system_openai_settings: systemOpenAISettings,
  system_stripe_settings: systemStripeSettings,
    navigation_permissions: navigationPermissions,
    permissions: mergedPermissions,
    status: raw.status || meta.status,
    live_status,
    last_seen,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/** Convenience helper to decide an effective tenant for user-scoped operations.
 * For superadmins with null tenant_id, callers must pass selectedTenantId.
 */
export function resolveEffectiveTenant(user, selectedTenantId) {
  if (!user) return null;
  if (user.tenant_id) return user.tenant_id;
  if (user.is_superadmin) return selectedTenantId || null;
  return null;
}
