import { logTenantEvent } from "./loggerUtils"; // Updated import to reference the new loggerUtils.js file

// UUID-only validation - enforces standardized tenant ID format
export const isValidId = (id) => {
  if (!id || typeof id !== "string") return false;
  // Only accept UUIDs (8-4-4-4-12 format)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

export const getTenantFilter = (user, selectedTenantId = null) => {
  if (!user) {
    logTenantEvent("WARNING", "getTenantFilter called without user", {});
    return {};
  }

  // Normalize keys to backend expectations: 'tenant_id'
  // Superadmins/admins can scope by selectedTenantId; employees use their own tenant_id
  const effectiveTenantId = selectedTenantId ?? user.tenant_id ?? null;

  // When null, caller can decide to fetch all tenants (global view)
  return effectiveTenantId ? { tenant_id: effectiveTenantId } : {};
};
