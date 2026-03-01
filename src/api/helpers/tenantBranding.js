// Tenant branding fast lookup helper
// Extracted from src/api/entities.js
import { BACKEND_URL } from '../core/httpClient';
import { User } from '../entityOverrides/user';

/**
 * Get current user's tenant branding - Direct backend call (bypasses Firebase)
 * Much faster than getMyTenantBranding() Firebase function
 *
 * @param {string} tenantId - Optional explicit tenant UUID
 * @returns {Promise<Object>} Tenant data with branding fields
 */
export async function getTenantBrandingFast(tenantId = null) {
  try {
    if (!tenantId) {
      // Try to get tenant from user first
      const user = await User.me();
      if (!user?.tenant_id) {
        throw new Error('No tenant context available');
      }
      tenantId = user.tenant_id;
    }

    const response = await fetch(`${BACKEND_URL}/api/tenants/${tenantId}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch tenant branding`);
    }

    const json = await response.json();
    const data = json?.data || json;

    // Return normalized tenant object with branding fields
    return {
      status: 200,
      data: {
        tenant: {
          id: data.id,
          tenant_id: data.tenant_id, // slug for UI
          name: data.name,
          logo_url: data.logo_url,
          primary_color: data.primary_color,
          accent_color: data.accent_color,
          settings: data.settings || data.branding_settings || {},
          country: data.country,
          industry: data.industry,
          created_at: data.created_at,
          updated_at: data.updated_at,
          ...data,
        },
      },
    };
  } catch (error) {
    console.error('[getTenantBrandingFast] Error:', error);
    // Return graceful fallback
    return {
      status: 500,
      error: error?.message || 'Failed to fetch tenant branding',
    };
  }
}
