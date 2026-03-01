// Activity entity with WAF-safe search extension
// Extracted from src/api/entities.js
import { createEntity } from '../core/createEntity';
import { BACKEND_URL, getAuthFetchOptions } from '../core/httpClient';
import { logDev } from '../../utils/devLogger';

export const Activity = createEntity('Activity');

// WAF-safe search for Activities using POST body instead of URL query params
// This avoids Cloudflare/Nginx WAF blocking MongoDB-style operators in URLs
Activity.search = async function (searchParams = {}) {
  const {
    q,
    fields = ['subject', 'body', 'notes'],
    limit = 50,
    offset = 0,
    status,
    type,
    assigned_to,
    related_to,
    related_id,
    date_from,
    date_to,
    sort_by = 'due_date',
    sort_order = 'desc',
    tenant_id,
  } = searchParams;

  // Get tenant_id from params, localStorage, or URL
  let tenantId = tenant_id;
  if (!tenantId && typeof window !== 'undefined') {
    tenantId =
      localStorage.getItem('selected_tenant_id') ||
      new URL(window.location.href).searchParams.get('tenant');
  }

  if (!tenantId) {
    throw new Error('tenant_id is required for Activity.search');
  }

  try {
    const authOpts = await getAuthFetchOptions();
    const response = await fetch(
      `${BACKEND_URL}/api/v2/activities/search?tenant_id=${encodeURIComponent(tenantId)}`,
      {
        method: 'POST',
        ...authOpts,
        body: JSON.stringify({
          q,
          fields,
          limit,
          offset,
          status,
          type,
          assigned_to,
          related_to,
          related_id,
          date_from,
          date_to,
          sort_by,
          sort_order,
          tenant_id: tenantId,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.status === 'success') {
      return result.data.activities || [];
    }

    throw new Error(result.message || 'Search failed');
  } catch (error) {
    logDev('[Activity.search] Error:', error);
    throw error;
  }
};
