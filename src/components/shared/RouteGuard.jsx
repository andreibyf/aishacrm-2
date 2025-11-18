import { AlertTriangle } from "lucide-react";

// Safely resolve access-related fields from mixed user shapes
function resolveAccessUser(user) {
  if (!user) return user;
  const meta = user.metadata || {};
  const navigation_permissions = user.navigation_permissions || meta.navigation_permissions || {};
  const role = user.role || user.employee_role || meta.employee_role || meta.role;
  const access_level = user.access_level || (user.permissions && user.permissions.access_level) || meta.access_level;
  const crm_access = typeof user.crm_access === "boolean" ? user.crm_access
    : (typeof meta.crm_access === "boolean" ? meta.crm_access : true);

  return {
    ...user,
    navigation_permissions,
    role,
    access_level,
    crm_access,
  };
}

/**
 * Helper: Check if user is a superadmin (god mode)
 */
function isSuperAdmin(user) {
  if (!user) return false;
  return user.is_superadmin === true ||
    user.access_level === "superadmin" ||
    user.role === "superadmin";
}

function hasPageAccess(user, pageName) {
  if (!user) return false;

  // Normalize access-related fields before checks
  user = resolveAccessUser(user);

  // GOD MODE: SuperAdmins bypass ALL restrictions
  if (isSuperAdmin(user)) {
    return true;
  }

  // CRM access gating
  const pagesAllowedWithoutCRM = new Set([
    "Documentation",
    "Agent",
    "Settings",
    "AuditLog",
    "UnitTests",
    "WorkflowGuide",
    "ClientRequirements",
  ]);
  if (user.crm_access === false) {
    return pagesAllowedWithoutCRM.has(pageName);
  }

  // Check navigation_permissions first (explicit user settings). Explicit false DENIES even for admin roles.
  if (
    user.navigation_permissions &&
    typeof user.navigation_permissions === "object"
  ) {
    const hasCustomPermission = Object.prototype.hasOwnProperty.call(
      user.navigation_permissions,
      pageName,
    );
    if (hasCustomPermission) {
      const explicit = user.navigation_permissions[pageName];
      if (explicit === false) return false; // explicit deny
      if (explicit === true) return true; // explicit allow
      // fall through if undefined/null
    }
  }

  // System pages for admins
  if (
    (user.role === "admin" || user.role === "superadmin") &&
    (pageName === "Documentation" || pageName === "Settings" ||
      pageName === "AuditLog" ||
      pageName === "Tenants" || pageName === "Agent" ||
      pageName === "UnitTests" ||
      pageName === "WorkflowGuide" || pageName === "ClientRequirements")
  ) {
    return true;
  }

  // Superadmins have full access
  if (user.role === "superadmin" || user.role === "admin") {
    return true;
  }

  // Default permissions based on role
  const defaultPermissions = {
    superadmin: {/* all pages */},
    admin: {/* all pages */},
    "power-user": {
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      DocumentProcessing: true,
      DocumentManagement: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      AICampaigns: true,
      Agent: true,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      WorkflowGuide: true,
      ClientOnboarding: true,
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    user: {
      Dashboard: true,
      Contacts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      Documentation: true,
      Agent: true,
      WorkflowGuide: true,
    },
  };

  const rolePermissions = defaultPermissions[user.role] ||
    defaultPermissions.user;
  return rolePermissions[pageName] || false;
}

export default function RouteGuard({ user, pageName, children }) {
  const resolvedUser = resolveAccessUser(user);
  // Debug logging
  console.log("[RouteGuard] Checking access for:", {
    pageName,
    userEmail: resolvedUser?.email,
    userRole: resolvedUser?.role,
    isSuperadmin: resolvedUser?.is_superadmin,
    accessLevel: resolvedUser?.access_level,
    crmAccess: resolvedUser?.crm_access,
  });

  if (!resolvedUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-200 mb-2">
            Authentication Required
          </h2>
          <p className="text-slate-400">Please log in to access this page.</p>
        </div>
      </div>
    );
  }

  if (!hasPageAccess(resolvedUser, pageName)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-200 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-400">
            You don&apos;t have permission to access this page. Please contact your
            administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
