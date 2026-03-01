/**
 * Shared chart utilities for analytics components.
 * Extracted from ProductivityAnalytics, LeadAnalytics, and SalesAnalytics.
 */

/**
 * Defensively unwrap API responses into arrays.
 * Handles: raw arrays, { data: [] }, { status: "success", data: [] },
 * { activities: [] }, { employees: [] }, { data: { activities: [] } }.
 */
export function unwrapApiResponse(result) {
  if (Array.isArray(result)) return result;
  if (result?.data && Array.isArray(result.data)) return result.data;
  if (result?.status === 'success' && Array.isArray(result.data)) return result.data;
  if (result?.activities && Array.isArray(result.activities)) return result.activities;
  if (result?.employees && Array.isArray(result.employees)) return result.employees;
  if (result?.data?.activities && Array.isArray(result.data.activities))
    return result.data.activities;
  return [];
}

export const COLORS_MAP = [
  ['#60a5fa', '#3b82f6'], // blue
  ['#34d399', '#10b981'], // emerald
  ['#fbbf24', '#f59e0b'], // amber
  ['#f87171', '#ef4444'], // red
  ['#a78bfa', '#8b5cf6'], // violet
  ['#2dd4bf', '#059669'], // teal
];

export const DARK_TOOLTIP_STYLE = {
  backgroundColor: '#1e293b',
  border: '1px solid #475569',
  borderRadius: '8px',
  color: '#f1f5f9',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
};

export const DARK_LABEL_STYLE = { color: '#f1f5f9' };
