/**
 * Utility functions for employee scope filtering
 */

export function applyEmployeeScopeFilter(baseFilter, user, selectedEmployeeEmail) {
  if (!user) return baseFilter;

  const isManager = user.employee_role === 'manager' || user.role === 'admin' || user.role === 'superadmin';
  
  if (!isManager) {
    return {
      ...baseFilter,
      assigned_to: user.email
    };
  }

  if (selectedEmployeeEmail && selectedEmployeeEmail !== 'all') {
    return {
      ...baseFilter,
      assigned_to: selectedEmployeeEmail
    };
  }

  return baseFilter;
}

export function getEmployeeScopeDescription(user, selectedEmployeeEmail) {
  if (!user) return 'All Records';

  const isManager = user.employee_role === 'manager' || user.role === 'admin' || user.role === 'superadmin';
  
  if (!isManager) {
    return 'My Records Only';
  }

  if (!selectedEmployeeEmail || selectedEmployeeEmail === 'all') {
    return 'All Team Records';
  }

  return `Filtered by Employee`;
}

export function shouldShowEmployeeScopeFilter(user) {
  if (!user) return false;
  return user.employee_role === 'manager' || user.role === 'admin' || user.role === 'superadmin';
}