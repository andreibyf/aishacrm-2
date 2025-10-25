/**
 * validateAndImport
 * 
 * ⚠️ MIGRATION NOTE: This Deno function has been migrated to the Express backend.
 * New endpoint: POST /api/validation/validate-and-import
 * Location: backend/routes/validation.js
 * 
 * This file is kept for reference only and is no longer used in production.
 * The backend endpoint provides the same functionality with direct database access.
 * 
 * Usage Example:
 * ```
 * const response = await fetch('/api/validation/validate-and-import', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     records: [{ first_name: 'John', last_name: 'Doe', email: 'john@example.com' }],
 *     entityType: 'Contact',
 *     fileName: 'contacts.csv',
 *     accountLinkColumn: '_company_name',
 *     tenant_id: 'your-tenant-id'
 *   })
 * });
 * const result = await response.json();
 * // result.data.successCount, result.data.failCount, result.data.errors
 * ```
 */

// DEPRECATED: Use backend endpoint instead
export default function validateAndImport() {
  throw new Error('This function has been migrated to backend/routes/validation.js. Use POST /api/validation/validate-and-import instead.');
}

