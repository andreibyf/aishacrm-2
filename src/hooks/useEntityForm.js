// Lightweight shared form hook to standardize submission flow, tenant resolution,
// number sanitation, and error normalization across entity forms.
import { useState, useCallback } from 'react';
import { User } from '@/api/entities';

/**
 * useEntityForm
 *
 * Inputs:
 * - options.resolveTenant: 'auto' | 'none' (default: 'auto')
 *
 * Returns:
 * - tenantId: resolved tenant id (if available)
 * - ensureTenantId(): Promise<string|null>
 * - isSubmitting: boolean
 * - withSubmit(handler): wraps an async submit handler with loading + error normalization
 * - sanitizeNumbers(values, fields): returns copy with specified fields coerced to numbers or null
 * - normalizeError(err): best-effort string message
 */
export function useEntityForm(options = {}) {
  const { resolveTenant = 'auto' } = options;

  const [tenantId, setTenantId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ensureTenantId = useCallback(async () => {
    if (resolveTenant !== 'auto') return null;
    if (tenantId) return tenantId;
    try {
      const me = await User.me();
      const resolved = me?.tenant_id || me?.tenantId || null;
      if (resolved) setTenantId(resolved);
      return resolved;
    } catch {
      return null;
    }
  }, [resolveTenant, tenantId]);

  const normalizeError = useCallback((error) => {
    if (!error) return 'Unknown error occurred';
    if (typeof error === 'string') return error;
    return (
      error?.response?.data?.error ||
      error?.message ||
      'Operation failed'
    );
  }, []);

  const withSubmit = useCallback((handler) => {
    return async (...args) => {
      setIsSubmitting(true);
      try {
        const result = await handler(...args);
        return result;
      } finally {
        setIsSubmitting(false);
      }
    };
  }, []);

  const sanitizeNumbers = useCallback((values, fields) => {
    if (!fields || fields.length === 0) return { ...values };
    const out = { ...values };
    for (const key of fields) {
      const v = out[key];
      out[key] = v === '' || v === undefined || v === null ? null : Number(v);
    }
    return out;
  }, []);

  return {
    tenantId,
    ensureTenantId,
    isSubmitting,
    withSubmit,
    sanitizeNumbers,
    normalizeError,
    setTenantId,
  };
}
