/**
 * Expand user metadata by promoting whitelisted keys to top-level fields
 * and computing display_name / full_name from first_name + last_name.
 *
 * Extracted from routes/users.js for testability.
 */

// Whitelist of metadata keys promoted to top-level for convenience.
const PROMOTE_KEYS = [
  'display_name',
  'live_status',
  'last_seen',
  'is_active',
  'account_status',
  'employee_role',
  'tags',
  'permissions',
  'navigation_permissions',
  'password_change_required',
  'password_expires_at',
];

export default function expandUserMetadata(user) {
  if (!user) return user;
  const { metadata = {}, ...rest } = user;

  const promoted = {};
  for (const k of PROMOTE_KEYS) {
    if (k in metadata) promoted[k] = metadata[k];
  }

  // Remove promoted keys from nested metadata to avoid duplication.
  const nestedMetadata = { ...metadata };
  for (const k of PROMOTE_KEYS) {
    if (k in nestedMetadata) delete nestedMetadata[k];
  }

  // Compute display_name and full_name from first_name + last_name if not already set.
  const computedFullName = [rest.first_name, rest.last_name].filter(Boolean).join(' ');
  if (!promoted.display_name && computedFullName) {
    promoted.display_name = computedFullName;
  }
  if (!promoted.display_name && rest.email) {
    promoted.display_name = rest.email;
  }

  return {
    ...rest,
    ...promoted,
    full_name: computedFullName || rest.email || null,
    metadata: nestedMetadata, // slim metadata without promoted duplicates
  };
}
