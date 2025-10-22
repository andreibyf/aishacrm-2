// components/ai/agentSdkGuard.js
// Prevents agent SDK from making API calls without proper tenant context

let currentTenantContext = {
  tenantId: null,
  tenantName: null,
};

export function initAgentSdkGuard({ tenantId, tenantName }) {
  currentTenantContext = { tenantId, tenantName };
}

export function resetAgentSdkGuard() {
  currentTenantContext = { tenantId: null, tenantName: null };
}

export function getAgentTenantContext() {
  return currentTenantContext;
}

export function isAgentContextValid() {
  return !!(currentTenantContext.tenantId && currentTenantContext.tenantName);
}