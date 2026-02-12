import { useState } from 'react'

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Removed: Switch component is replaced by native checkbox
import { Card, CardContent } from "@/components/ui/card";
// Removed Alert and AlertDescription as messages are now handled by toast
// import { Alert, AlertDescription } from "@/components/ui/alert";

import { useTenant } from "../shared/tenantContext";

import { Employee } from "@/api/entities";
import { toast } from "sonner";
// Removed: ResendInviteButton is removed from this form's outline
// import ResendInviteButton from "./ResendInviteButton"; // This import is no longer needed

// Standardized props: { initialData, onSubmit, onCancel, tenantId } while retaining backward compat for existing parent usage.
export default function EmployeeForm({ employee: legacyEmployee, initialData, onSubmit, onSave, onCancel, tenantId }) {
  console.log('[EmployeeForm] Rendering with props:', { legacyEmployee, initialData, tenantId });
  
  // Prefer initialData if provided; fall back to legacy 'employee' prop.
  const employee = initialData || legacyEmployee || null;
  const isEdit = !!(employee && employee.id);
  const { _selectedTenantId } = useTenant(); // Kept for potential future use or context check

  const [formData, setFormData] = useState(() => ({
    first_name: employee?.first_name || '',
    last_name: employee?.last_name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    mobile: employee?.mobile || '',
    department: employee?.department || 'sales', // Default "sales" if not provided
    job_title: employee?.job_title || '',
    manager_employee_id: employee?.manager_employee_id || null,
    hire_date: employee?.hire_date || '',
    employment_status: employee?.employment_status || 'active',
    employment_type: employee?.employment_type || 'full_time',
    hourly_rate: employee?.hourly_rate || '',
    skills: employee?.skills || [],
    address_1: employee?.address_1 || '',
    address_2: employee?.address_2 || '',
    city: employee?.city || '',
    state: employee?.state || '',
    zip: employee?.zip || '',
    emergency_contact_name: employee?.emergency_contact_name || '',
    emergency_contact_phone: employee?.emergency_contact_phone || '',
    notes: employee?.notes || '',
    tags: employee?.tags || [],
    is_active: employee?.is_active !== false, // Default to true unless explicitly false

    // Retained CRM-related fields from original as UI exists and functionality should be preserved
    has_crm_access: employee?.has_crm_access || false,
    crm_user_employee_role: employee?.crm_user_employee_role || "employee",
  }));

  const [saving, setSaving] = useState(false);
  // Removed message state as toast is used for notifications
  // const [message, setMessage] = useState(null);

  const [_skillInput, _setSkillInput] = useState(''); // New state variable
  const [_tagInput, _setTagInput] = useState(''); // New state variable

  const onChange = (key, value) => setFormData((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[EmployeeForm] handleSubmit called', { tenantId, isEdit, formData });
    
    // Removed setMessage(null) as message state is removed

    // Validation - only required fields
    if (!formData.first_name?.trim()) {
      console.log('[EmployeeForm] Validation failed: first_name missing');
      toast.error('First name is required');
      return;
    }
    if (!formData.last_name?.trim()) {
      console.log('[EmployeeForm] Validation failed: last_name missing');
      toast.error('Last name is required');
      return;
    }

    // Validation for CRM access - email is required only if enabling CRM access
    if (formData.has_crm_access && !formData.email?.trim()) {
      console.log('[EmployeeForm] Validation failed: CRM access requires email');
      toast.error("Email is required for CRM access requests.");
      return;
    }
    if (!tenantId && !isEdit) {
      console.log('[EmployeeForm] Validation failed: tenant_id missing');
      toast.error("Cannot save employee. Tenant information is missing.");
      return;
    }

    console.log('[EmployeeForm] Validation passed, starting save...');
    setSaving(true);

    try {
      // Assemble normalized entity payload for standardized onSubmit callback.
      const entityPayload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email || null,
        phone: formData.phone || null,
        mobile: formData.mobile || null,
        department: formData.department,
        job_title: formData.job_title,
        manager_employee_id: formData.manager_employee_id,
        hire_date: formData.hire_date || null,
        employment_status: formData.employment_status,
        employment_type: formData.employment_type,
        hourly_rate: formData.hourly_rate ? Number(formData.hourly_rate) : null,
        skills: formData.skills,
        address_1: formData.address_1 || null,
        address_2: formData.address_2 || null,
        city: formData.city || null,
        state: formData.state || null,
        zip: formData.zip || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
        notes: formData.notes || null,
        tags: formData.tags,
        is_active: formData.is_active,
        has_crm_access: formData.has_crm_access,
        crm_user_employee_role: formData.has_crm_access ? formData.crm_user_employee_role : null,
        tenant_id: tenantId || null,
      };

      console.log('[EmployeeForm] Entity payload prepared:', entityPayload);

      let result;
      try {
        if (employee?.id) {
          console.log('[EmployeeForm] Calling Employee.update...', employee.id);
          result = await Employee.update(employee.id, entityPayload);
        } else {
          console.log('[EmployeeForm] Calling Employee.create...');
          result = await Employee.create(entityPayload);
        }
        console.log('[EmployeeForm] API call successful:', result);
        const isEdit = !!employee?.id;
        if (formData.has_crm_access && formData.email) {
          toast.success(isEdit ? 'Employee updated – CRM invitation sent' : 'Employee created – CRM invitation sent');
        } else {
          toast.success(isEdit ? 'Employee updated successfully' : 'Employee created successfully');
        }
      } catch (err) {
        console.error('[EmployeeForm] API call failed:', err);
        const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to save employee';
        toast.error(msg);
        throw err;
      }

      // Prefer new standardized onSubmit(data) signature; fallback to legacy onSave() if provided.
      setTimeout(() => {
        if (onSubmit) {
          onSubmit(result);
        } else if (onSave) {
          onSave();
        }
      }, 500);
    } catch (error) {
      console.error('[EmployeeForm] Save error:', error);
      // More robust error message extraction
      const errorMsg = error?.response?.data?.error || error?.message || 'Failed to save employee';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Removed Alert component as message state and its display are removed */}
      {/* {message && (
        <Alert className="bg-slate-800 border-slate-700">
          <AlertDescription className="text-slate-200">{message}</AlertDescription>
        </Alert>
      )} */}

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <div>
            <Label className="text-slate-200">
              First name <span className="text-red-400">*</span>
            </Label>
            <Input
              required
              value={formData.first_name}
              onChange={(e) => onChange("first_name", e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="First name"
            />
          </div>
          <div>
            <Label className="text-slate-200">
              Last name <span className="text-red-400">*</span>
            </Label>
            <Input
              required
              value={formData.last_name}
              onChange={(e) => onChange("last_name", e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="Last name"
            />
          </div>
          <div>
            <Label className="text-slate-200">
              Email {formData.has_crm_access && <span className="text-red-400">*</span>}
            </Label>
            <Input
              type="email"
              required={formData.has_crm_access}
              value={formData.email}
              onChange={(e) => onChange("email", e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="work@example.com"
            />
            {formData.has_crm_access && (
              <p className="text-xs text-amber-400 mt-1">
                Email is required for CRM access
              </p>
            )}
          </div>
          <div>
            <Label className="text-slate-200">Phone</Label>
            <Input
              value={formData.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <Label className="text-slate-200">Department</Label>
            <Select value={formData.department} onValueChange={(v) => onChange("department", v)}>
              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="field_services">Field Services</SelectItem>
                <SelectItem value="construction">Construction</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="administration">Administration</SelectItem>
                <SelectItem value="management">Management</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="customer_service">Customer Service</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-200">Job title</Label>
            <Input
              value={formData.job_title}
              onChange={(e) => onChange("job_title", e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="Role / Title"
            />
          </div>
          {/* Note: Additional fields like mobile, hire_date, employment_status, employment_type, hourly_rate, address_1, address_2, city, state, zip, emergency_contact_name, emergency_contact_phone, notes, manager_employee_id, skills, tags, is_active are now part of formData but their corresponding UI elements are not explicitly requested in the outline. They will be saved if available in formData. */}
        </CardContent>
      </Card>

      {/* CRM Access Section */}
      <div className="border-t border-slate-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-slate-100">CRM Access</h3>
            <p className="text-sm text-slate-400">
              Grant this employee access to the CRM system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="has-crm-access" className="text-sm text-slate-300">Enable CRM access</label>
            <input
              id="has-crm-access"
              type="checkbox"
              checked={formData.has_crm_access}
              onChange={(e) => onChange("has_crm_access", e.target.checked)}
              className="rounded border-slate-600 bg-slate-700"
            />
          </div>
        </div>

        {formData.has_crm_access && (
          <div className="space-y-4 pl-4 border-l-2 border-slate-700">
            <div>
              <Label className="text-slate-300">CRM Role</Label>
              <Select
                value={formData.crm_user_employee_role || "employee"}
                onValueChange={(value) => onChange("crm_user_employee_role", value)}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="employee" className="text-slate-200">Employee (Own records only)</SelectItem>
                  <SelectItem value="manager" className="text-slate-200">Manager (All tenant records)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {formData.crm_user_employee_role === 'manager' ?
                  '✓ Can view all records in their tenant' :
                  '✓ Can only view records assigned to them'}
              </p>
            </div>

            {employee && employee.crm_invite_status && (
              <div className="text-sm text-slate-400">
                <span className="font-medium">Status:</span> {employee.crm_invite_status.replace(/_/g, " ")}
                {employee.crm_invite_last_sent && (
                  <span className="ml-2">
                    (Last sent: {new Date(employee.crm_invite_last_sent).toLocaleDateString()})
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        <p className="text-xs text-slate-400">
          <span className="text-red-400">*</span> Required fields
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="bg-slate-700 border-slate-600 text-slate-200">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving..." : isEdit ? "Update Employee" : "Create Employee"}
          </Button>
        </div>
      </div>
    </form>
  );
}
