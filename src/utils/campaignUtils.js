// [2026-02-23 Claude] — shared campaign utilities

/**
 * Safely parse target_contacts from a campaign record.
 * The DB stores JSONB but it may arrive as a JSON string depending on
 * how the backend serialises the column. This helper handles both cases.
 *
 * @param {Array|string|null|undefined} tc - raw target_contacts value
 * @returns {Array} parsed array (never null)
 */
export function parseContacts(tc) {
  if (Array.isArray(tc)) return tc;
  if (typeof tc === 'string') {
    try {
      const parsed = JSON.parse(tc);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
