/**
 * Permission System for Ai-SHA CRM
 * Clean, simple role-based authorization
 */

import { logDev } from '@/utils/devLogger';

// Role hierarchy (higher number = more permissions)
export const ROLES = {
  employee: 1,
  manager: 2,
  admin: 3,
  superadmin: 4,
};

// Get role level for comparisons
export function getRoleLevel(role) {
  return ROLES[role?.toLowerCase()] || 0;
}

/**
 * Can this user assign CRM access to employees?
 * Only Admins and SuperAdmins can grant/revoke CRM access
 */
export function canAssignCRMAccess(currentUser) {
  const role = currentUser?.role?.toLowerCase();
  return role === 'admin' || role === 'superadmin';
}

/**
 * Can this user create/edit employees?
 * SuperAdmin: Can edit anyone in any tenant
 * Admin: Can edit employees in their own tenant only
 * Manager: Cannot edit employees
 * Employee: Cannot edit employees
 */
export function canEditEmployee(currentUser, targetEmployee) {
  const userRole = currentUser?.role?.toLowerCase();

  // SuperAdmins can edit anyone
  if (userRole === 'superadmin') return true;

  // Admins can edit employees in their own tenant
  if (userRole === 'admin') {
    // If admin has no tenant (global admin), can edit anyone
    if (!currentUser.tenant_id) return true;

    // Must be same tenant
    if (currentUser.tenant_id !== targetEmployee?.tenant_id) return false;

    // Cannot edit other admins or superadmins
    const targetRole = targetEmployee?.role?.toLowerCase();
    if (targetRole === 'admin' || targetRole === 'superadmin') return false;

    return true;
  }

  // Managers and Employees cannot edit
  return false;
}

/**
 * Can this user delete another user?
 * SuperAdmin: Can delete anyone except themselves
 * Admin: Can delete employees/managers in their own tenant
 * Manager: Cannot delete users
 * Employee: Cannot delete users
 */
export function canDeleteUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false;

  const userRole = currentUser?.role?.toLowerCase();
  const targetRole = targetUser?.role?.toLowerCase();

  // Cannot delete yourself
  if (currentUser.id === targetUser.id) return false;

  // SuperAdmins can delete anyone except themselves (backend enforces at least one superadmin remains)
  if (userRole === 'superadmin') {
    return currentUser.id !== targetUser.id;
  }

  // Admins can delete employees and managers in their own tenant
  if (userRole === 'admin') {
    // Cannot delete other admins or superadmins
    if (targetRole === 'admin' || targetRole === 'superadmin') {
      return false;
    }

    // Must be same tenant
    if (currentUser.tenant_id && targetUser.tenant_id) {
      return currentUser.tenant_id === targetUser.tenant_id;
    }

    return false;
  }

  // Managers and employees cannot delete users
  return false;
}

/**
 * Can this user view all tenant data?
 * SuperAdmin: All tenants
 * Admin: Their tenant
 * Manager: Their tenant (read-only for user management)
 * Employee: Only their own records
 */
export function canViewAllTenantData(currentUser) {
  const role = currentUser?.role?.toLowerCase();
  return role === 'superadmin' || role === 'admin' || role === 'manager';
}

/**
 * Can this user manage tenants (clients)?
 * Only SuperAdmins and Admins
 */
export function canManageTenants(currentUser) {
  const role = currentUser?.role?.toLowerCase();
  return role === 'superadmin' || role === 'admin';
}

/**
 * Can this user assign this role to someone?
 * SuperAdmin: Can assign any role
 * Admin: Can assign manager or employee (not admin or superadmin)
 * Others: Cannot assign roles
 */
export function canAssignRole(currentUser, targetRole) {
  const userRole = currentUser?.role?.toLowerCase();
  const target = targetRole?.toLowerCase();

  if (userRole === 'superadmin') return true;

  if (userRole === 'admin') {
    // Admins can only assign manager or employee
    return target === 'manager' || target === 'employee';
  }

  return false;
}

/**
 * Get available roles this user can assign
 */
export function getAssignableRoles(currentUser) {
  const userRole = currentUser?.role?.toLowerCase();

  if (userRole === 'superadmin') {
    return [
      { value: 'superadmin', label: 'Superadmin - Full system access' },
      { value: 'admin', label: 'Admin - Can manage users and tenants' },
      { value: 'manager', label: 'Manager - Can view all tenant data' },
      { value: 'employee', label: 'Employee - Standard CRM user' },
    ];
  }

  if (userRole === 'admin') {
    return [
      { value: 'manager', label: 'Manager - Can view all tenant data' },
      { value: 'employee', label: 'Employee - Standard CRM user' },
    ];
  }

  return [];
}

/**
 * Validate user creation/edit based on permissions
 * Returns { valid: boolean, error: string }
 */
export function validateUserPermissions(currentUser, targetUser, action = 'edit') {
  const userRole = currentUser?.role?.toLowerCase();

  // SuperAdmins can do anything
  if (userRole === 'superadmin') {
    return { valid: true };
  }

  // Admins have restrictions
  if (userRole === 'admin') {
    // Creating new user
    if (action === 'create') {
      // Must assign to a tenant (admins cannot create global users)
      if (!targetUser.tenant_id) {
        return {
          valid: false,
          error: 'Admins must assign users to a specific tenant',
        };
      }

      // Must assign to their own tenant (if they have one)
      if (currentUser.tenant_id && currentUser.tenant_id !== targetUser.tenant_id) {
        return {
          valid: false,
          error: 'You can only create users for your own tenant',
        };
      }

      // Cannot assign admin or superadmin roles
      const targetRole = targetUser.role?.toLowerCase();
      if (targetRole === 'admin' || targetRole === 'superadmin') {
        return {
          valid: false,
          error: 'Only SuperAdmins can create Admin or SuperAdmin users',
        };
      }
    }

    // Editing existing user
    if (action === 'edit') {
      if (!canEditEmployee(currentUser, targetUser)) {
        return {
          valid: false,
          error: 'You do not have permission to edit this user',
        };
      }
    }

    return { valid: true };
  }

  // Managers and Employees cannot create/edit users
  return {
    valid: false,
    error: 'Only Admins and SuperAdmins can manage users',
  };
}

/**
 * Permission summary for display
 */
export function getPermissionSummary(user) {
  const role = user?.role?.toLowerCase();

  const summary = {
    role: role,
    canAssignCRMAccess: canAssignCRMAccess(user),
    canEditEmployees: role === 'admin' || role === 'superadmin',
    canViewAllTenantData: canViewAllTenantData(user),
    canManageTenants: canManageTenants(user),
    dataVisibility:
      role === 'employee'
        ? 'Own records only'
        : role === 'manager'
          ? 'All tenant data (read-only user management)'
          : role === 'admin'
            ? 'All tenant data'
            : 'All data across all tenants',
  };

  return summary;
}

// ===================================================================================
// Layout Navigation Permissions
// Functions extracted from Layout.jsx for navigation access control
// ===================================================================================

/**
 * Helper: Check if user is a superadmin (Layout navigation)
 */
export function isSuperAdmin(user) {
  if (!user) return false;
  return (
    user.is_superadmin === true || user.access_level === 'superadmin' || user.role === 'superadmin'
  );
}

/**
 * Helper: Check if user is admin or superadmin (Layout navigation)
 */
export function isAdminOrSuperAdmin(user) {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'superadmin' || user.is_superadmin === true;
}

export function hasPageAccess(user, pageName, selectedTenantId, moduleSettings = []) {
  if (!user) return false;

  logDev('[hasPageAccess] Called with:', {
    pageName,
    userEmail: user.email,
    userRole: user.role,
    hasNavigationPermissions: !!user.navigation_permissions,
    navigationPermissionsType: typeof user.navigation_permissions,
    navigationPermissions: user.navigation_permissions,
  });

  // Superadmins bypass disables only in global view (no tenant selected)
  if (isSuperAdmin(user) && (selectedTenantId === null || selectedTenantId === undefined)) {
    return true;
  }

  const superadminOnlyPages = new Set(['Tenants']);
  if (superadminOnlyPages.has(pageName) && user.role !== 'superadmin') return false;

  const pagesAllowedWithoutCRM = new Set([
    'Documentation',
    'DeveloperAI',
    'Settings',
    'AuditLog',
    'UnitTests',
    'ClientRequirements',
  ]);
  if (user.crm_access === false) return pagesAllowedWithoutCRM.has(pageName);

  // Module names must match EXACTLY what's stored in modulesettings table
  // See ModuleManager.jsx defaultModules for the canonical names
  const moduleMapping = {
    Dashboard: 'Dashboard',
    Contacts: 'Contact Management',
    Accounts: 'Account Management',
    Leads: 'Lead Management',
    Opportunities: 'Opportunities',
    Activities: 'Activity Tracking',
    Communications: 'Activity Tracking',
    Calendar: 'Calendar',
    BizDevSources: 'Potential Leads',
    CashFlow: 'Cash Flow Management',
    DocumentProcessing: 'Document Processing & Management',
    DocumentManagement: 'Document Processing & Management',
    DocumentTemplates: 'Document Templates (eSign)',
    Employees: 'Employee Management',
    Reports: 'Analytics & Reports',
    Integrations: 'Integrations',
    PaymentPortal: 'Payment Portal',
    // Finance Ops uses the backend canonical module key directly. See
    // navigationConfig.js for the same mapping + backend financeModuleGate.js
    // for the canonical 'financeOps' / alias 'enterpriseFinance' keys.
    FinanceOps: 'financeOps',
    AICampaigns: 'AI Campaigns',
    AISuggestions: 'AI Suggestions',
    DeveloperAI: 'Developer AI',
    Utilities: 'Utilities',
    ClientOnboarding: 'Client Onboarding',
    Workflows: 'Workflows',
    ConstructionProjects: 'Project Management',
    Workers: 'Workers',
    CareWorkflows: 'CARE Workflows',
    DuplicateContacts: null,
    DuplicateAccounts: null,
    DuplicateLeads: null,
    Tenants: null,
    Settings: null,
    Documentation: null,
    AuditLog: null,
    UnitTests: null,
    ClientRequirements: null,
  };

  // Module aliases — when checking access for a canonical module name, also
  // accept any listed alias as an equivalent enrolment. Mirrors the backend
  // gate (backend/lib/finance/financeModuleGate.js:7-16,29-48) which accepts
  // 'enterpriseFinance' as a legacy alias for 'financeOps'. Without this
  // table, a tenant enrolled via the alias would clear the backend gate but
  // be hidden in the frontend nav — frontend/backend access drift.
  const moduleAliases = {
    financeOps: ['enterpriseFinance'],
  };

  const requiredModuleId = moduleMapping[pageName];
  if (requiredModuleId && moduleSettings.length > 0) {
    // Canonical-wins resolution. Mirrors the backend's R-6 rule at
    // backend/lib/finance/financeModuleGate.js:40-48: when both the canonical
    // row and a legacy alias row exist with conflicting `is_enabled` values,
    // the canonical row wins. The earlier flat `find(acceptableNames)` was
    // order-dependent — Supabase does not guarantee row order — so a
    // conflicting alias row could land first and flip the gate's verdict.
    // Resolve in two passes: canonical first, then alias only when canonical
    // is absent.
    const aliasList = moduleAliases[requiredModuleId] || [];

    // Tenant scoping (Codex P1, PR #624). For admin/superadmin sessions Layout
    // loads EVERY tenant's module rows via ModuleSettings.list() (Layout.jsx
    // ~1233), so an unrelated tenant's row — e.g. the new default-disabled
    // `financeOps` seed — must NOT shadow the selected tenant's setting.
    // Restrict resolution to the selected tenant's rows plus any global default
    // rows (no tenant_id), and prefer the tenant-specific row over a global
    // default. Mirrors the tenant-then-default resolution used elsewhere in
    // this file (e.g. lines ~444-450).
    const scopedSettings = selectedTenantId
      ? moduleSettings.filter((m) => m.tenant_id === selectedTenantId || m.tenant_id == null)
      : moduleSettings;
    const findRow = (name) =>
      scopedSettings.find((m) => m.module_name === name && m.tenant_id === selectedTenantId) ||
      scopedSettings.find((m) => m.module_name === name);

    let moduleSetting = findRow(requiredModuleId);
    if (!moduleSetting && aliasList.length > 0) {
      for (const alias of aliasList) {
        moduleSetting = findRow(alias);
        if (moduleSetting) break;
      }
    }
    if (moduleSetting && moduleSetting.is_enabled === false) return false;
  }

  // Settings page is always accessible to authenticated users (for profile settings)
  // Admin tabs within Settings are controlled by the Settings page itself
  if (pageName === 'Settings') return true;

  if (user.navigation_permissions && typeof user.navigation_permissions === 'object') {
    if (pageName === 'Dashboard') {
      logDev('[hasPageAccess] User navigation_permissions:', {
        userEmail: user.email,
        role: user.role,
        permissions: user.navigation_permissions,
        pageName,
      });
    }
    const hasCustomPermission = Object.prototype.hasOwnProperty.call(
      user.navigation_permissions,
      pageName,
    );
    if (hasCustomPermission) {
      const explicit = user.navigation_permissions[pageName];
      logDev(`[hasPageAccess] Explicit permission for ${pageName}:`, explicit);
      if (explicit === false) return false;
      if (explicit === true) return true;
    }
  }

  if (
    (user.role === 'admin' || user.role === 'superadmin') &&
    (pageName === 'Documentation' ||
      pageName === 'AuditLog' ||
      pageName === 'Tenants' ||
      pageName === 'UnitTests' ||
      pageName === 'ClientRequirements' ||
      pageName === 'ConstructionProjects')
  )
    return true;
  if (user.role === 'superadmin' && pageName === 'DeveloperAI') return true;
  if ((user.role === 'superadmin' || user.role === 'admin') && !selectedTenantId) return true;

  const defaultPermissions = getDefaultNavigationPermissions(user.role);
  return defaultPermissions[pageName] || false;
}

export function getDefaultNavigationPermissions(role, navItems = [], secondaryNavItems = []) {
  // Combine all possible navigation items to generate a comprehensive list of pageNames
  const allPageHrefs = [
    ...navItems.map((item) => item.href),
    ...secondaryNavItems.map((item) => item.href),
    // Add other system/hidden pages that might need default permissions
    'DuplicateContacts',
    'DuplicateAccounts',
    'DuplicateLeads',
    'Tenants',
    'AuditLog',
    'UnitTests',
    'ClientOnboarding',
    'ClientRequirements', // NEW: Added ClientRequirements
  ];

  // Initialize all permissions to false for safety
  const basePermissions = Object.fromEntries(allPageHrefs.map((href) => [href, false]));

  const defaults = {
    superadmin: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Communications: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      FinanceOps: true, // visible by default; gated by the per-tenant financeOps module row (design §11.3 — no frontend role gate)
      DocumentProcessing: true,
      DocumentManagement: true,
      DocumentTemplates: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      PaymentPortal: true,
      AICampaigns: true,
      AISuggestions: true,
      DeveloperAI: true,
      Tenants: true,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      UnitTests: true,
      ClientOnboarding: true,
      ClientRequirements: true, // NEW
      CareWorkflows: true,
      ConstructionProjects: true, // Construction staffing module
      Workers: true, // Worker/contractor management
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    admin: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Communications: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      FinanceOps: true, // visible by default; gated by the per-tenant financeOps module row (design §11.3 — no frontend role gate)
      DocumentProcessing: true,
      DocumentManagement: true,
      DocumentTemplates: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      PaymentPortal: true,
      AICampaigns: true,
      AISuggestions: true,
      Tenants: true,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      UnitTests: true,
      ClientOnboarding: true,
      ClientRequirements: true, // NEW
      CareWorkflows: true,
      ConstructionProjects: true, // Construction staffing module
      Workers: true, // Worker/contractor management
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    manager: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Communications: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      FinanceOps: true, // visible by default; gated by the per-tenant financeOps module row (design §11.3 — no frontend role gate)
      DocumentProcessing: true,
      DocumentManagement: true,
      DocumentTemplates: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      PaymentPortal: false,
      AICampaigns: true,
      AISuggestions: true,
      Tenants: false,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      UnitTests: false,
      ClientOnboarding: true,
      ClientRequirements: false,
      CareWorkflows: false,
      ConstructionProjects: true, // Construction staffing module
      Workers: true, // Worker/contractor management
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    employee: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Communications: true,
      Calendar: true,
      FinanceOps: true, // visible by default; gated by the per-tenant financeOps module row (design §11.3 — no frontend role gate)
      Documentation: true,
      Settings: true, // All users need access to their profile settings
      ClientOnboarding: false,
      ClientRequirements: false,
      ConstructionProjects: true, // Construction staffing module - workers need access
      Workers: true, // Worker/contractor management - workers need access
    },
  };

  // Merge the basePermissions with role-specific permissions, ensuring role-specific explicit 'true's override 'false'
  const rolePermissions = { ...(defaults[role] || defaults.employee) };

  // Explicitly ensure 'Settings', 'Documentation' are accessible for all roles if CRM access is true
  // (CRM access check is done in hasPageAccess first)
  rolePermissions.Settings = true; // Always allow Settings for profile access
  rolePermissions.Documentation = rolePermissions.Documentation || true;
  rolePermissions.ClientRequirements = rolePermissions.ClientRequirements || false; // NEW: Explicitly manage ClientRequirements access

  return rolePermissions;
}
