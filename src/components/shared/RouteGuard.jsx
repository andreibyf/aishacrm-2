import { AlertTriangle } from "lucide-react";

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

  // GOD MODE: SuperAdmins bypass ALL restrictions
  if (isSuperAdmin(user)) {
    console.log("[RouteGuard God Mode] SuperAdmin has access to:", pageName);
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

  // Check navigation_permissions first (explicit user settings)
  if (
    user.navigation_permissions &&
    typeof user.navigation_permissions === "object"
  ) {
    const hasCustomPermission = Object.prototype.hasOwnProperty.call(
      user.navigation_permissions,
      pageName,
    );
    if (hasCustomPermission) {
      return user.navigation_permissions[pageName] === true;
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
  // Debug logging
  console.log("[RouteGuard] Checking access for:", {
    pageName,
    userEmail: user?.email,
    userRole: user?.role,
    isSuperadmin: user?.is_superadmin,
    accessLevel: user?.access_level,
    crmAccess: user?.crm_access,
  });

  if (!user) {
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

  if (!hasPageAccess(user, pageName)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-200 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-400">
            You don't have permission to access this page. Please contact your
            administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
