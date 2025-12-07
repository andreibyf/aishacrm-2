/**
 * Centralized tenant extraction, canonicalization, and authorization.
 */

import { resolveCanonicalTenant } from "../tenantCanonicalResolver.js";

/**
 * Extract tenant identifier from an Express request.
 */
export function getTenantIdFromRequest(req) {
  return (
    req.headers["x-tenant-id"] ||
    req.query?.tenant_id ||
    req.query?.tenantId ||
    req.user?.tenant_id ||
    null
  );
}

/**
 * Resolve a tenant identifier (UUID or slug) into a canonical record:
 * { id: <uuid>, tenant_id: <slug>, name: <string> }
 */
export async function resolveTenantRecord(identifier) {
  if (!identifier || typeof identifier !== "string") return null;
  const key = identifier.trim();
  if (!key) return null;

  try {
    const result = await resolveCanonicalTenant(key);
    if (result && result.found && result.uuid) {
      return {
        id: result.uuid,
        tenant_id: result.slug,
        name: result.slug,
      };
    }
    return null;
  } catch (error) {
    console.warn(
      "[AIEngine][TenantContext] resolveTenantRecord failed:",
      error?.message || error
    );
    return null;
  }
}

/**
 * Authorization check: user can only access their own tenant.
 */
export function validateUserTenantAccess(req, requestedTenantId, tenantRecord) {
  const user = req.user;

  if (!user) {
    if (process.env.NODE_ENV === "development") {
      return { authorized: true };
    }
    return {
      authorized: false,
      error: "Authentication required. Please log in and try again.",
    };
  }

  if (!user.tenant_id) {
    return {
      authorized: false,
      error: "Your account is not assigned to any tenant. Contact your administrator.",
    };
  }

  const userTenantId = user.tenant_id;

  const isAuthorized =
    userTenantId === tenantRecord?.id || userTenantId === tenantRecord?.tenant_id;

  if (!isAuthorized) {
    console.warn("[AIEngine][TenantContext] Cross-tenant access blocked:", {
      user_id: user.id,
      user_email: user.email,
      user_tenant_id: userTenantId,
      requested_tenant_uuid: tenantRecord?.id,
      requested_tenant_slug: tenantRecord?.tenant_id,
      requested_identifier: requestedTenantId,
    });
    return {
      authorized: false,
      error: "You can only access data for your assigned tenant.",
    };
  }

  return { authorized: true };
}
