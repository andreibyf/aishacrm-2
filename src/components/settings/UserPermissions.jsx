
import { useState, useEffect, useCallback } from "react";
import { User } from "@/api/entities";
import { Tenant } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, AlertCircle, Users2, Eye, PencilLine } from "lucide-react";
// import { useTenant } from "../shared/tenantContext"; // Reserved for future use
import NavigationPermissions from "./NavigationPermissions";
import TagInput from "../shared/TagInput";
import { toast } from "sonner";

export default function UserPermissions({ userEmail, onClose }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // useTenant hook not currently needed but kept for potential future use
  // const { selectedTenantId } = useTenant();

  const [displayName, setDisplayName] = useState("");
  const [selectedTenant, setSelectedTenant] = useState("");
  const [tenants, setTenants] = useState([]);
  const [role, setRole] = useState("user");
  const [employeeRole, setEmployeeRole] = useState("");
  const [accessLevel, setAccessLevel] = useState("read_write");
  const [crmAccess, setCrmAccess] = useState(true);
  const [canUseSoftphone, setCanUseSoftphone] = useState(false);
  const [dashboardScope, setDashboardScope] = useState("own");
  const [tags, setTags] = useState([]);
  const [assignedManager, setAssignedManager] = useState("");
  const [managers, setManagers] = useState([]);

  const [navigationPermissions, setNavigationPermissions] = useState({
    Dashboard: true,
    Contacts: true,
    Accounts: true,
    Leads: true,
    Opportunities: true,
    Activities: true,
    Calendar: true,
    BizDevSources: true,
    CashFlow: true,
    Employees: false,
    Reports: false,
    Integrations: true,
    Settings: false,
    Documentation: true,
    AICampaigns: false,
    Agent: true,
    DocumentProcessing: false,
    DocumentManagement: false,
    PaymentPortal: false,
    Utilities: false
  });

  const loadUserData = useCallback(async () => {
    try {
      setLoading(true);
      const users = await User.list();
      const foundUser = users.find(u => u.email === userEmail);
      
      if (!foundUser) {
        setError("User not found");
        return;
      }

      console.log("Loaded user:", foundUser);
      console.log("User's stored navigation_permissions:", foundUser.navigation_permissions);

      setUser(foundUser);
      setDisplayName(foundUser.display_name || foundUser.full_name || "");
      setSelectedTenant(foundUser.tenant_id || "");
      setRole(foundUser.role || "user");
      setEmployeeRole(foundUser.employee_role || "");
      setAccessLevel(foundUser.access_level || "read_write");
      setCrmAccess(foundUser.crm_access !== false);
      setCanUseSoftphone(foundUser.permissions?.can_use_softphone || false);
      setDashboardScope(foundUser.permissions?.dashboard_scope || "own");
      setTags(foundUser.tags || []);
      setAssignedManager(foundUser.assigned_manager || "");
      
      if (foundUser.navigation_permissions) {
        console.log("Setting navigation permissions from user:", foundUser.navigation_permissions);
        setNavigationPermissions(prev => ({
          ...prev,
          ...foundUser.navigation_permissions
        }));
      }
    } catch (err) {
      console.error("Failed to load user:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  const loadTenants = useCallback(async () => {
    try {
      const fetchedTenants = await Tenant.list();
      setTenants(fetchedTenants || []);
    } catch (err) {
      console.warn("Could not load tenants:", err);
    }
  }, []);

  const loadManagers = useCallback(async () => {
    try {
      const users = await User.list();
      const managerUsers = users.filter(u => 
        u.employee_role === 'manager' || 
        u.role === 'admin' || 
        u.role === 'superadmin'
      );
      setManagers(managerUsers);
    } catch (err) {
      console.warn("Could not load managers:", err);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    loadTenants();
    loadManagers();
  }, [loadUserData, loadTenants, loadManagers]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      console.log("Saving navigation_permissions:", navigationPermissions);

      const updates = {
        display_name: displayName,
        tenant_id: selectedTenant || null,
        role,
        employee_role: employeeRole || null,
        access_level: accessLevel,
        crm_access: crmAccess,
        tags,
        assigned_manager: assignedManager || null,
        permissions: {
          ...(user.permissions || {}),
          can_use_softphone: canUseSoftphone,
          dashboard_scope: dashboardScope
        },
        navigation_permissions: navigationPermissions
      };

      console.log("Full update payload:", JSON.stringify(updates, null, 2));

      await User.update(user.id, updates);
      
      // Reload the user to verify the save
      const updatedUsers = await User.list();
      const updatedUser = updatedUsers.find(u => u.email === userEmail);
      console.log("After save, user navigation_permissions:", updatedUser?.navigation_permissions);

      toast.success("User permissions updated successfully");
      
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error("Failed to save user permissions:", err);
      setError(err.message);
      toast.error("Failed to update permissions: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-slate-900">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* User Info Header */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Users2 className="w-5 h-5" />
            User Access Settings — {userEmail}
          </CardTitle>
          <CardDescription className="text-slate-400">
            Configure user roles, access levels, and permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Display Name */}
          <div>
            <Label className="text-slate-200">Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., John Doe"
              className="bg-slate-900 border-slate-700 text-slate-100"
            />
          </div>

          {/* Client/Tenant */}
          <div>
            <Label className="text-slate-200">Client</Label>
            <Select value={selectedTenant} onValueChange={setSelectedTenant}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                <SelectItem value={null}>No Tenant (System Admin)</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role & Employee Role Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-200">Base44 Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectItem value="superadmin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="power-user">Power User</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-200">Employee Role</Label>
              <Select value={employeeRole || 'none'} onValueChange={(val) => setEmployeeRole(val === 'none' ? '' : val)}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Select employee role" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectItem value="none">None (Use Base44 Role)</SelectItem>
                  <SelectItem value="manager">
                    <div className="flex flex-col">
                      <span className="font-semibold">Manager</span>
                      <span className="text-xs text-slate-400">Full tenant visibility</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="employee">
                    <div className="flex flex-col">
                      <span className="font-semibold">Employee</span>
                      <span className="text-xs text-slate-400">Own records only</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                Two-tier RBAC: Managers see all team data, Employees see only their own records.
              </p>
            </div>
          </div>

          {/* Tags */}
          <div>
            <Label className="text-slate-200">Tags</Label>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder="e.g., Sales, Manager"
              className="bg-slate-900 border-slate-700 text-slate-100"
            />
          </div>

          {/* Softphone */}
          <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
            <Label className="text-slate-200">Can use Softphone</Label>
            <Switch
              checked={canUseSoftphone}
              onCheckedChange={setCanUseSoftphone}
            />
          </div>

          {/* CRM Access */}
          <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
            <Label className="text-slate-200">CRM Access</Label>
            <Switch
              checked={crmAccess}
              onCheckedChange={setCrmAccess}
            />
          </div>

          {/* Access Level & Dashboard Scope Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-200 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Access Level
              </Label>
              <Select value={accessLevel} onValueChange={setAccessLevel}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="read_write">Read/Write</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-200 flex items-center gap-2">
                <PencilLine className="w-4 h-4" />
                Dashboard Data Scope
              </Label>
              <Select value={dashboardScope} onValueChange={setDashboardScope}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectItem value="own">Own Records Only</SelectItem>
                  <SelectItem value="aggregated">Aggregated (tenant)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Manager Assignment */}
          {employeeRole && (
            <div>
              <Label className="text-slate-200">Manager</Label>
              <Select value={assignedManager} onValueChange={setAssignedManager}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectItem value={null}>No Manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.email}>
                      {m.display_name || m.full_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                A manager will be able to view this employee&apos;s data and their own team.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Permissions */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Navigation Permissions</CardTitle>
          <CardDescription className="text-slate-400">
            {navigationPermissions ? Object.keys(navigationPermissions).filter(k => navigationPermissions[k]).length : 0} enabled
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NavigationPermissions
            value={navigationPermissions}
            onChange={(newPerms) => {
              console.log("NavigationPermissions onChange called with:", newPerms);
              setNavigationPermissions(newPerms);
            }}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={onClose}
          className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
