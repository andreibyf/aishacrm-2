
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { inviteUser } from "@/api/functions";
import { SendEmail } from "@/api/integrations";
import { notifyAdminOnInvite } from "@/components/shared/NotifyAdminOnInvite";
import { requestUserInvite } from "@/api/functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // NEW IMPORT

// Inject/fix the submit handler to send email via Core.SendEmail if backend can't
// This function is now responsible for the core invitation logic, including
// attempting to send an invite email to the invitee and notifying admins.
// Updated to accept employee_role and requested_role
async function handleEmployeeInviteSubmit(payload) {
  // Expected payload: { email, fullName, tenant_id, employee_role, requested_role }
  const request = {
    email: payload.email,
    fullName: payload.fullName || "",
    accessLevel: payload.requested_role || "user", // System Role
    tier: payload.employee_role || "employee", // Business Role
    tenant_id: payload.tenant_id || undefined,
  };

  // Step 1: Attempt to create the user invite record via the backend
  const res = await inviteUser(request);

  // If inviteUser itself failed (e.g., duplicate email, server error)
  // Throw an error that can be caught by the calling function (handleSubmit)
  if (res?.status !== 200 || res?.data?.error) {
    throw new Error(res?.data?.error || "Failed to create invitation record.");
  }

  // Step 2: If invite record created, check for email sending instructions from backend
  const emailData = res?.data?.emailPayload || res?.data?.emailFallback;
  if (emailData && emailData.to && emailData.subject && emailData.body) {
    // Backend provided data to send an email to the invitee
    try {
      await SendEmail({
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
        from_name: emailData.from_name || "Ai-SHA CRM",
      });
      if (typeof window !== "undefined") {
        alert(`Invitation email sent to ${emailData.to}`);
      }
    } catch (e) {
      console.warn("EmployeeInviteDialog: SendEmail to invitee failed:", e?.message || e);
      if (typeof window !== "undefined") {
        alert("Invite recorded but email could not be sent automatically.");
      }
    }
  } else if (res?.data?.message) {
    // Backend provided a specific message but no email data
    if (typeof window !== "undefined") {
      alert(res.data.message);
    }
  } else {
    // Backend did not provide email data, or explicitly said no email was sent
    if (typeof window !== "undefined") {
      alert("Invitation recorded. If no email arrives, share the app URL and ask the user to log in once.");
    }
  }

  // Step 3: Notify admin via email and SMS (frontend fallback for robustness)
  await notifyAdminOnInvite({
    invitedEmail: request.email,
    invitedName: request.fullName || request.email,
    role: request.accessLevel, // System Role
    tier: request.tier, // Business Role
    tenantId: request.tenant_id || null,
  });

  // Return the data received from the inviteUser call, indicating success of invite record creation.
  return res?.data || { success: true };
}

// NEW: request flow for Tier3 (no direct invite), always sends admin email with requester context
// Updated to accept employee_role and requested_role
async function handleEmployeeRequestSubmit(payload) {
  // payload: { email, fullName, tenant_id, employee_role, requested_role }
  const req = {
    email: payload.email,
    full_name: payload.fullName || "",
    requested_access: payload.requested_role || "user", // System Role
    requested_tier: payload.employee_role || "employee", // Business Role
    tenant_id: payload.tenant_id || undefined
  };

  const res = await requestUserInvite(req); // backend logs + notifies superadmins (basic)
  // Regardless of backend email, send our structured admin email as well:
  await notifyAdminOnInvite({
    invitedEmail: req.email,
    invitedName: req.full_name || req.email,
    role: req.requested_access, // System Role
    tier: req.requested_tier, // Business Role
    tenantId: req.tenant_id,
  });

  // Return a normalized result
  const ok = res?.status === 200 && !res?.data?.error;
  return {
    success: ok,
    mode: "request_invite",
    data: res?.data
  };
}

export default function EmployeeInviteDialog({ open, onOpenChange, employee, currentUser, onSuccess }) {
  const [formData, setFormData] = React.useState({
    fullName: "",
    email: "",
    employee_role: "employee", // Default to employee
    requested_role: "user", // Default to user
  });
  const [loading, setLoading] = React.useState(false);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "superadmin";
  const isTier4 = currentUser?.tier === "Tier4"; // Assuming Tier4 implies direct invite capability
  const isTier3 = currentUser?.tier === "Tier3"; // Assuming Tier3 implies request capability
  const canDirectInvite = isAdmin || isTier4;
  const canRequestInvite = isTier3 && !canDirectInvite; // Tier3 can request, but not if they can direct invite

  React.useEffect(() => {
    if (open) {
      if (employee) {
        setFormData({
          fullName: `${employee.first_name || ""} ${employee.last_name || ""}`.trim(),
          email: employee.email || employee.user_email || "",
          employee_role: employee.employee_role || "employee", // Pre-fill if employee has this field
          requested_role: employee.requested_role || "user", // Pre-fill if employee has this field
        });
      } else {
        // Reset form for a new invite when opening if no employee is passed
        setFormData({
          fullName: "",
          email: "",
          employee_role: "employee",
          requested_role: "user",
        });
      }
    } else {
      // Reset form when dialog closes
      setFormData({
        fullName: "",
        email: "",
        employee_role: "employee",
        requested_role: "user",
      });
    }
  }, [open, employee]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.fullName) {
      alert("Email and Full Name are required.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email: formData.email,
        fullName: formData.fullName,
        tenant_id: employee?.tenant_id, // Pass tenant_id from employee if available
        employee_role: formData.employee_role,
        requested_role: formData.requested_role,
      };

      let result;
      if (canDirectInvite) {
        result = await handleEmployeeInviteSubmit(payload);
        // The handleEmployeeInviteSubmit already sends an admin notification.
        // The `notifyAdminOnInvite` call from the original component was redundant here and is removed.
        onSuccess && onSuccess({ ...result, mode: "direct_invite" });
      } else if (canRequestInvite) {
        result = await handleEmployeeRequestSubmit(payload);
        onSuccess && onSuccess(result);
      } else {
        alert("You don’t have permission to invite or request an invite for employees.");
        setLoading(false);
        return;
      }
      onOpenChange(false);
    } catch (e) {
      console.error("Error in employee invitation/request:", e);
      if (typeof window !== "undefined") {
        alert(e.message || "An unexpected error occurred during the invitation process.");
      }
    } finally {
      setLoading(false);
    }
  };

  const actionButtonText = employee ? "Update Access Request" : (canDirectInvite ? "Send Invitation" : "Send Request to Admin");
  const dialogTitle = employee ? 'Update CRM Access Request' : 'Request CRM Access for Employee';
  const dialogDescription = employee ?
    'Update the access level and permissions for this employee.' :
    'Send an invitation to grant this employee access to the CRM system.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Display form only if user has any permission */}
          {(canDirectInvite || canRequestInvite) ? (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300" htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                  placeholder="Employee full name"
                  required
                />
              </div>
              <div>
                <Label className="text-slate-300" htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-slate-200"
                  placeholder="name@company.com"
                  required
                />
              </div>

              <div className="space-y-4 border-t border-slate-700 pt-4">
                <h3 className="text-sm font-semibold text-slate-200">Access Level</h3>

                <div>
                  <Label htmlFor="employee_role" className="text-slate-300">Employee Role *</Label>
                  <Select
                    value={formData.employee_role}
                    onValueChange={(value) => handleChange('employee_role', value)}
                    required
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                      <SelectValue placeholder="Select role..." />
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
                  <p className="text-xs text-slate-500 mt-1">
                    {formData.employee_role === 'manager' ?
                      'Managers have full visibility and control over all CRM data in their tenant.' :
                      'Employees can only see records assigned to them.'
                    }
                  </p>
                </div>

                <div>
                  <Label htmlFor="requested_role" className="text-slate-300">System Role</Label>
                  <Select
                    value={formData.requested_role}
                    onValueChange={(value) => handleChange('requested_role', value)}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="user" className="text-slate-200">User</SelectItem>
                      <SelectItem value="power-user" className="text-slate-200">Power User</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Power Users have additional administrative capabilities
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-red-400">You do not have permission to invite or request an invite for employees.</p>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              type="button" // Important to prevent form submission
            >
              Cancel
            </Button>
            {(canDirectInvite || canRequestInvite) ? (
              <Button
                type="submit" // This button now submits the form
                disabled={loading || !formData.email || !formData.fullName}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {actionButtonText}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
