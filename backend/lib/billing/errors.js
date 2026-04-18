/**
 * Platform Billing -- Error Utilities
 *
 * Structured error class and classifier for billing operations.
 * Routes use classifyBillingError() to map errors to HTTP status codes.
 */

export const BILLING_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EXEMPT: 'EXEMPT',
  INACTIVE_PLAN: 'INACTIVE_PLAN',
  NO_ACTIVE_SUBSCRIPTION: 'NO_ACTIVE_SUBSCRIPTION',
  INVOICE_STATE: 'INVOICE_STATE',
  INVOICE_PAID: 'INVOICE_PAID',
});

/**
 * Structured billing error with an HTTP-friendly statusCode.
 *
 * Usage:
 *   throw new BillingError('tenant_id required', {
 *     statusCode: 400,
 *     code: BILLING_ERROR_CODES.INVALID_INPUT,
 *   });
 */
export class BillingError extends Error {
  constructor(message, { statusCode = 400, code } = {}) {
    super(message);
    this.name = 'BillingError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Classify an error into an HTTP status code.
 *
 * 1. If `err` is a BillingError, return its statusCode directly.
 * 2. Otherwise fall back to legacy regex matching:
 *    - If `legacyPattern` matches err.message → 400
 *    - Else → 500
 *
 * @param {Error}  err            The caught error
 * @param {RegExp} legacyPattern  Optional regex for legacy 400-class errors
 * @returns {number} HTTP status code
 */
export function classifyBillingError(err, legacyPattern) {
  if (err instanceof BillingError) {
    return err.statusCode;
  }
  if (legacyPattern && legacyPattern.test(err.message)) {
    return 400;
  }
  return 500;
}
