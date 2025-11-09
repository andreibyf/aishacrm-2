/**
 * Local implementation of getDashboardStats
 * Calls the backend API endpoint for dashboard statistics
 */

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

export async function getDashboardStats({ tenantFilter }) {
  try {
    // Extract tenant_id from filter
    const tenant_id = tenantFilter?.tenant_id;
    
    if (!tenant_id) {
      console.warn('getDashboardStats: No tenant_id provided');
      return {
        status: 'error',
        message: 'tenant_id is required',
        data: null
      };
    }

    // Call backend API
    const response = await fetch(`${BACKEND_URL}/api/reports/dashboard-stats?tenant_id=${tenant_id}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    return {
      status: 'success',
      data: {
        stats: result.data || {}
      }
    };
  } catch (error) {
    console.error('getDashboardStats error:', error);
    return {
      status: 'error',
      message: error.message,
      data: { stats: {} }
    };
  }
}
