import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { inviteUser } from "@/api/functions";
import {
  canAssignCRMAccess,
  getAssignableRoles,
  validateUserPermissions,
} from "@/utils/permissions";

export default function InviteUserDialog(
  { open, onOpenChange, onSuccess, tenants, currentUser },
) {
  const { toast } = useToast();

  // Get roles this user can assign
  const assignableRoles = getAssignableRoles(currentUser);

  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    role: "employee",
    tenant_id: currentUser?.tenant_id || "", // Default to current user's tenant if they have one
    crm_access: true, // CRM Access toggle - default to true for new users
    can_use_softphone: false,
    access_level: "read_write",
    phone: "",
    navigation_permissions: {
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      BizDevSources: false,
      CashFlow: false,
      DocumentProcessing: false,
      DocumentManagement: false,
      AICampaigns: false,
      Employees: false,
      Reports: false,
      Integrations: false,
      Documentation: true,
      Settings: true,
      Agent: true,
      PaymentPortal: false,
      Utilities: false,
      Workflows: false,
      ClientOnboarding: false,
      WorkflowGuide: false,
      ClientRequirements: false,
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate permissions before submitting
    const validation = validateUserPermissions(currentUser, formData, "create");
    if (!validation.valid) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: validation.error,
      });
      return;
    }

    if (!formData.email || !formData.full_name || !formData.role) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Email, name, and role are required.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        tenant_id: formData.tenant_id || null,
        crm_access: formData.crm_access, // Include CRM access toggle
        requested_access: formData.access_level || "read_write",
        can_use_softphone: formData.can_use_softphone || false,
        phone: formData.phone || null,
        permissions: {
          navigation_permissions: formData.navigation_permissions || {},
        },
      };

      const response = await inviteUser(payload, currentUser);

      if (response?.status === 200 && response?.data?.success) {
        const data = response.data;

        toast({
          title: "User Created Successfully",
          description: data.message ||
            `${formData.email} has been added to the system.`,
        });

        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        const errorMsg = response?.data?.error || response?.data?.message ||
          "Failed to create user";
        toast({
          variant: "destructive",
          title: "User Creation Failed",
          description: errorMsg,
        });
      }
    } catch (error) {
      console.error("Error inviting user:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "An error occurred",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = () => {
    setFormData({
      email: "",
      full_name: "",
      role: "employee",
      tenant_id: "",
      crm_access: true, // Reset CRM access to default
      can_use_softphone: false,
      access_level: "read_write",
      phone: "",
      navigation_permissions: {
        Dashboard: true,
        Contacts: true,
        Accounts: true,
        Leads: true,
        Opportunities: true,
        Activities: true,
        Calendar: true,
        BizDevSources: false,
        CashFlow: false,
        Employees: false,
        Reports: false,
        Settings: true,
        Integrations: false,
        AICampaigns: false,
        Agent: true,
        Documentation: true,
      },
    });
    onOpenChange(false);
  };

  const handleNavigationChange = (permissionKey, value) => {
    setFormData((prev) => ({
      ...prev,
      navigation_permissions: {
        ...prev.navigation_permissions,
        [permissionKey]: value,
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Add New User</DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a new user account for your CRM workspace
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-slate-200">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Enter email address"
              required
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
            />
          </div>

          <div>
            <Label htmlFor="full_name" className="text-slate-200">
              Full Name
            </Label>
            <Input
              id="full_name"
              type="text"
              value={formData.full_name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
              placeholder="Enter full name"
              required
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-slate-200">
              Phone Number (Optional)
            </Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="+1234567890"
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">
              Include country code for SMS notification (e.g., +1 for US)
            </p>
          </div>

          <div>
            <Label htmlFor="role" className="text-slate-200">Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => {
                setFormData((prev) => ({
                  ...prev,
                  role: value,
                  // Clear tenant_id for SuperAdmin (must be global)
                  tenant_id: value === "superadmin" ? null : prev.tenant_id,
                }));
              }}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                {assignableRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">
              You can assign: {assignableRoles.map((r) => r.value).join(", ")}
            </p>
          </div>

          {tenants && tenants.length > 0 && formData.role !== "superadmin" && (
            <div>
              <Label htmlFor="tenant" className="text-slate-200">
                Client {formData.role === "admin" ? "(Required)" : "(Optional)"}
              </Label>
              <Select
                value={formData.tenant_id || "no-client"}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    tenant_id: value === "no-client" ? null : value,
                  }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectItem value="no-client">No specific client</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.role === "superadmin" && (
            <div className="border border-yellow-600 rounded-lg p-4 bg-yellow-900/20">
              <p className="text-sm text-yellow-400">
                <strong>⚠️ SuperAdmin Note:</strong>{" "}
                This user will have global access to all tenants and system
                settings. No client assignment needed.
              </p>
            </div>
          )}

          <div className="border border-slate-600 rounded-lg p-4 bg-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5 text-orange-500" />
                <Label
                  htmlFor="crm_access"
                  className="text-slate-200 font-semibold"
                >
                  CRM Access (Login Enabled)
                </Label>
              </div>
              <Switch
                id="crm_access"
                checked={formData.crm_access}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, crm_access: checked }))}
                disabled={!canAssignCRMAccess(currentUser)}
                className="data-[state=checked]:bg-orange-500"
              />
            </div>
            <p className="text-sm text-slate-400">
              {formData.crm_access
                ? "✓ User can log in and access the CRM application"
                : "✗ User exists in system but cannot log in (for reference/reporting only)"}
            </p>
            {!canAssignCRMAccess(currentUser) && (
              <p className="text-xs text-amber-400 mt-2">
                Only Admins and SuperAdmins can assign CRM access
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="access_level" className="text-slate-200">
              Access Level
            </Label>
            <Select
              value={formData.access_level}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, access_level: value }))}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
                <SelectItem value="read_write">Read & Write</SelectItem>
                <SelectItem value="read_only">Read Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="can_use_softphone"
              checked={formData.can_use_softphone}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  can_use_softphone: checked,
                }))}
              className="data-[state=checked]:bg-orange-500"
            />
            <Label htmlFor="can_use_softphone" className="text-slate-200">
              Can use Softphone
            </Label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-slate-200 font-semibold">
                Navigation Permissions (Advanced)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const allEnabled = Object.keys(
                    formData.navigation_permissions,
                  ).reduce((acc, key) => {
                    acc[key] = true;
                    return acc;
                  }, {});
                  setFormData((prev) => ({
                    ...prev,
                    navigation_permissions: allEnabled,
                  }));
                }}
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 text-xs"
              >
                Enable All
              </Button>
            </div>
            <p className="text-sm text-slate-400">
              Granular control over which pages this user can access
            </p>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-700 border border-slate-600 rounded-lg max-h-60 overflow-y-auto">
              {Object.keys(formData.navigation_permissions).map((permKey) => (
                <div key={permKey} className="flex items-center space-x-2">
                  <Switch
                    id={`nav_${permKey}`}
                    checked={formData.navigation_permissions[permKey] || false}
                    onCheckedChange={(checked) =>
                      handleNavigationChange(permKey, checked)}
                    className="data-[state=checked]:bg-orange-500"
                  />
                  <Label
                    htmlFor={`nav_${permKey}`}
                    className="text-slate-300 text-sm cursor-pointer"
                  >
                    {permKey}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {submitting
                ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                )
                : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Create User
                  </>
                )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
