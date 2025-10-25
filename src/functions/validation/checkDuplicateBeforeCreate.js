/**
 * checkDuplicateBeforeCreate
 * 
 * ⚠️ MIGRATION NOTE: This Deno function has been migrated to the Express backend.
 * New endpoint: POST /api/validation/check-duplicate-before-create
 * Location: backend/routes/validation.js
 * 
 * This file is kept for reference only and is no longer used in production.
 * The backend endpoint provides the same functionality with direct database access.
 * 
 * Usage Example:
 * ```
 * const response = await fetch('/api/validation/check-duplicate-before-create', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     entity_type: 'Contact', // or 'Lead', 'Account'
 *     data: { email: 'test@example.com', phone: '1234567890' },
 *     tenant_id: 'your-tenant-id'
 *   })
 * });
 * const result = await response.json();
 * // result.data.has_duplicates, result.data.duplicates
 * ```
 */

// DEPRECATED: Use backend endpoint instead
export default function checkDuplicateBeforeCreate() {
  throw new Error('This function has been migrated to backend/routes/validation.js. Use POST /api/validation/check-duplicate-before-create instead.');
}

