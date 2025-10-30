import { logTenantEvent } from "./loggerUtils"; // Updated import to reference the new loggerUtils.js file

// Flexible ID validation that accepts both MongoDB ObjectIDs and custom IDs
export const isValidId = (id) => {
  if (!id || typeof id !== "string") return false;
  // Accept MongoDB ObjectIDs (24 hex chars) or custom IDs (alphanumeric with hyphens/underscores)
  return /^[a-f0-9]{24}$/i.test(id) || /^[a-zA-Z0-9\-_]+$/.test(id);
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
