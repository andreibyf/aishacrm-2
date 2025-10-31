import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Info, Shield, AlertTriangle } from 'lucide-react'
import { updateEmployeeUserAccess } from "@/api/functions";
// import { updateEmployeeDetails } from "@/api/functions/updateEmployeeDetails"; // TODO: Create this function
const updateEmployeeDetails = async () => { throw new Error("updateEmployeeDetails not implemented"); }; // Temporary stub
import { toast } from "react-hot-toast"; // Assuming react-hot-toast is used for notifications
import EmployeeInviteDialog from "./EmployeeInviteDialog";

export default function EmployeePermissionsDialog({ open, onOpenChange, employee, editorUser, onSave }) {
  const [formData, setFormData] = React.useState({
    access_level: "read_write",
    employee_role: "employee",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showInvite, setShowInvite] = React.useState(false);

  const linkedEmail = employee?.user_email || null;
  const hasCrmAccess = employee?.has_crm_access === true && !!linkedEmail;

  const canInviteDirect = !!editorUser && (editorUser.role === "admin" || editorUser.role === "superadmin" || editorUser.employee_role === "manager");

  React.useEffect(() => {
    if (open) {
      setError(null);
      setShowInvite(false);
      
      setFormData({
        access_level: employee?.crm_user_access_level || "read_write",
        employee_role: employee?.crm_user_employee_role || "employee",
      });
    }
  }, [open, employee]);

  const handleSave = async () => {
    setError(null);
    if (!hasCrmAccess) {
      const msg = "This employee is not linked to a CRM user. Please enable CRM Access and set the CRM User Email in the employee form first.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      // 1. Update the User entity (this already works via updateEmployeeUserAccess)
      const userResp = await updateEmployeeUserAccess({
        user_email: linkedEmail,
        access_level: formData.access_level,
        employee_role: formData.employee_role
      });

      const userStatus = userResp?.status ?? 500;
      const userData = userResp?.data ?? {};

      if (userStatus !== 200 || userData?.success !== true) {
        const msg = userData?.error || `Failed to update user permissions (status ${userStatus})`;
        if (userStatus === 404 || /not\s*found/i.test(msg)) {
          setError("Linked CRM user not found. You can invite or request an invite below.");
          setShowInvite(true);
          toast.error("Linked CRM user not found. Please invite or request an invite.");
          return;
        }
        if (userStatus === 401 || userStatus === 403 || /unauthorized|forbidden/i.test(msg)) {
          setError("You don't have permission to change user access. Please contact an admin.");
          toast.error("Permission denied to update user access.");
          return;
        }
        setError(msg);
        toast.error(msg);
        return;
      }

      // 2. NEW: Also update the Employee entity to keep it in sync
      await updateEmployeeDetails(employee.id, {
        crm_user_employee_role: formData.employee_role,
        crm_user_access_level: formData.access_level,
        crm_access_tier: formData.employee_role === 'manager' ? 'Tier4' : (employee.crm_access_tier || 'Tier1')
      });

      toast.success("Permissions updated successfully!");
      
      if (onSave) {
        onSave();
      }
      
      onOpenChange(false); // Changed from onOpenChange?.(false) as per outline
      
      // Force page refresh to apply new permissions
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (e) {
      const errMsg = e?.response?.data?.error || e?.message || "Failed to save permissions.";
      if (/not\s*found/i.test(errMsg)) {
        setError("Linked CRM user not found. You can invite or request an invite below.");
        setShowInvite(true);
        toast.error("Linked CRM user not found. Please invite or request an invite.");
      } else if (/unauthorized|forbidden/i.test(errMsg)) {
        setError("You don't have permission to change access. Please contact an admin.");
        toast.error("Permission denied to save permissions.");
      } else {
        setError(errMsg);
        toast.error(`Failed to update permissions: ${errMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setShowInvite(false);
    setSaving(false);
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            Manage Permissions: {employee?.first_name} {employee?.last_name}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure access level and permissions for this employee
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {!hasCrmAccess && (
          <Alert className="bg-amber-900/20 border-amber-700/30">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-amber-300">CRM Access Not Enabled</AlertTitle>
            <AlertDescription className="text-amber-200 space-y-3">
              <p>This employee needs to be linked to a CRM user account before you can manage their permissions.</p>
              <div className="text-sm space-y-1">
                <p className="font-semibold">To enable permissions management:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Close this dialog</li>
                  <li>Click the Edit button (pencil icon) for this employee</li>
                  <li>Enable "CRM Access" toggle</li>
                  <li>Set the "CRM User Email" field</li>
                  <li>Choose the appropriate Tier and Role</li>
                  <li>Optionally send an invite</li>
                  <li>Save the employee</li>
                  <li>Return here to manage detailed permissions</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <Alert className="bg-blue-900/20 border-blue-700/30">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300 text-sm">
              <strong>Linked CRM User:</strong> {linkedEmail || "None"}
              {!linkedEmail && " - CRM user email must be set to manage permissions"}
            </AlertDescription>
          </Alert>

          {/* Employee Role Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Employee Role
            </h3>
            
            <div>
              <Label className="text-slate-300">Role Level</Label>
              <Select 
                value={formData.employee_role || 'employee'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, employee_role: value }))}
                disabled={!hasCrmAccess}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="employee" className="text-slate-200">
                    <div className="flex flex-col">
                      <span className="font-medium">Employee</span>
                      <span className="text-xs text-slate-400">Can only view and manage their own records</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="manager" className="text-slate-200">
                    <div className="flex flex-col">
                      <span className="font-medium">Manager</span>
                      <span className="text-xs text-slate-400">Can view and manage all team records</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Access Level Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Access Level
            </h3>
            <div>
              <Label className="text-slate-300">CRM Data Access</Label>
              <Select 
                value={formData.access_level || 'read_write'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, access_level: value }))} 
                disabled={!hasCrmAccess}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="read_write">Read/Write</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {showInvite && canInviteDirect && employee && (
          <EmployeeInviteDialog
            open={showInvite}
            onOpenChange={setShowInvite}
            employee={employee}
            currentUser={editorUser}
            onDone={() => {
              setShowInvite(false);
              if (onSave) { onSave(); } // Changed from onSuccess?.()
            }}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
            {hasCrmAccess ? 'Cancel' : 'Close'}
          </Button>
          {hasCrmAccess && (
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
