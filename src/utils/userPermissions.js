/**
 * User Permission Utilities
 * 
 * Centralized functions for checking user roles and permissions.
 * This module helps maintain consistent permission checks across the application.
 * 
 * @module utils/userPermissions
 */

/**
 * Check if a user has superadmin privileges
 * 
 * @param {Object} user - The user object to check
 * @param {boolean} user.is_superadmin - Direct superadmin flag
 * @param {string} user.access_level - Access level indicator
 * @param {string} user.role - User role
 * @returns {boolean} True if user is a superadmin
 */
export function isSuperAdmin(user) {
  if (!user) return false;
  return (
    user.is_superadmin === true ||
    user.access_level === "superadmin" ||
    user.role === "superadmin"
  );
}

/**
 * Check if a user has admin or superadmin privileges
 * 
 * @param {Object} user - The user object to check
 * @param {boolean} user.is_superadmin - Direct superadmin flag
 * @param {string} user.role - User role (admin, superadmin, etc.)
 * @returns {boolean} True if user is an admin or superadmin
 */
export function isAdminOrSuperAdmin(user) {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.role === "superadmin" ||
    user.is_superadmin === true
  );
}

/**
 * Check if a user has manager privileges
 * 
 * @param {Object} user - The user object to check
 * @param {string} user.role - User role
 * @returns {boolean} True if user is a manager
 */
export function isManager(user) {
  if (!user) return false;
  return user.role === "manager";
}

/**
 * Check if a user has power user privileges
 * 
 * @param {Object} user - The user object to check
 * @param {string} user.role - User role
 * @returns {boolean} True if user is a power user
 */
export function isPowerUser(user) {
  if (!user) return false;
  return user.role === "power_user";
}

/**
 * Get the hierarchy level of a user role
 * Higher numbers indicate more privileges
 * 
 * @param {string} role - The user role
 * @returns {number} Hierarchy level (0-4)
 */
export function getRoleHierarchy(role) {
  const hierarchy = {
    superadmin: 4,
    admin: 3,
    manager: 2,
    power_user: 1,
    user: 0,
  };
  return hierarchy[role] ?? 0;
}

/**
 * Check if one role has higher privileges than another
 * 
 * @param {string} role1 - First role to compare
 * @param {string} role2 - Second role to compare
 * @returns {boolean} True if role1 has higher privileges than role2
 */
export function hasHigherRole(role1, role2) {
  return getRoleHierarchy(role1) > getRoleHierarchy(role2);
}
