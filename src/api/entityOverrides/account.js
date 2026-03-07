// Account entity with bulkAssign extension
import { createEntity } from '../core/createEntity';
import { BACKEND_URL, getAuthFetchOptions } from '../core/httpClient';

export const Account = {
  ...createEntity('Account'),

  async bulkAssign(ids, assignedTo, tenantId, { overrideTeam = false } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0, skipped: 0, errors: [] };
    if (!tenantId) throw new Error('tenantId is required for Account.bulkAssign');
    const authOpts = await getAuthFetchOptions();
    const response = await fetch(`${BACKEND_URL}/api/v2/accounts/bulk-assign`, {
      method: 'POST',
      ...authOpts,
      body: JSON.stringify({
        ids,
        assigned_to: assignedTo,
        tenant_id: tenantId,
        override_team: overrideTeam,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Bulk assign failed: ${response.status}`);
    }
    const result = await response.json();
    return result.data || { updated: 0, skipped: 0, errors: [] };
  },
};
