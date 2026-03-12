import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '../shared/tenantContext';
import { Employee } from '@/api/entities';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { Users, ExternalLink, Link2 } from 'lucide-react';

const BACKEND_URL = getBackendUrl();

/**
 * EmployeeForm - HR-focused employee record form
 *
 * This form manages HR data only (name, phone, department, job title, etc.)
 * CRM access and team assignments are managed via User Management.
 *
 * If the employee is linked to a CRM user (via email match), their team
 * assignments are displayed as read-only badges.
 */
export default function EmployeeForm({
  employee: legacyEmployee,
  initialData,
  onSubmit,
  onSave,
  onCancel,
  tenantId,
}) {
  const employee = initialData || legacyEmployee || null;
  const isEdit = !!(employee && employee.id);
  useTenant(); // imported for tenant context; resolved via tenantId prop

  // HR fields only - no CRM access management
  const [formData, setFormData] = useState(() => ({
    first_name: employee?.first_name || '',
    last_name: employee?.last_name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    mobile: employee?.mobile || '',
    department: employee?.department || 'sales',
    job_title: employee?.job_title || '',
    reports_to: employee?.reports_to || null,
    hire_date: employee?.hire_date || '',
    employment_status: employee?.employment_status || 'active',
    employment_type: employee?.employment_type || 'full_time',
    hourly_rate: employee?.hourly_rate || '',
    address_1: employee?.address_1 || '',
    address_2: employee?.address_2 || '',
    city: employee?.city || '',
    state: employee?.state || '',
    zip: employee?.zip || '',
    emergency_contact_name: employee?.emergency_contact_name || '',
    emergency_contact_phone: employee?.emergency_contact_phone || '',
    notes: employee?.notes || '',
    tags: employee?.tags || [],
    is_active: employee?.is_active !== false,
  }));

  const [saving, setSaving] = useState(false);

  // Team assignments from linked user (read-only display)
  const [linkedUserInfo, setLinkedUserInfo] = useState(null);
  const [teamAssignments, setTeamAssignments] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // Available employees for "Reports To" dropdown
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Fetch employees for Reports To dropdown
  useEffect(() => {
    if (!tenantId) return;

    const fetchEmployees = async () => {
      setLoadingEmployees(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/employees?tenant_id=${tenantId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const payload = await res.json();
          // API response shapes:
          // - Tenant listing: { status, data: { employees: [...] } }
          // - Email lookup variant: { status, data: [] }
          let allEmployees = [];
          if (Array.isArray(payload?.data?.employees)) {
            allEmployees = payload.data.employees;
          } else if (Array.isArray(payload?.data)) {
            allEmployees = payload.data;
          } else if (Array.isArray(payload)) {
            allEmployees = payload;
          }
          // Filter to active employees only, then exclude self (can't report to yourself)
          const employees = allEmployees
            .filter((e) =>
              e.employment_status ? e.employment_status === 'active' : e.is_active !== false,
            )
            .filter((e) => e.id !== employee?.id);
          setEmployeeOptions(employees);
        }
      } catch (err) {
        console.warn('[EmployeeForm] Failed to fetch employees:', err);
      } finally {
        setLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, [tenantId, employee?.id]);

  // Fetch linked user info and team assignments
  useEffect(() => {
    if (!employee?.email || !tenantId) return;

    const fetchLinkedUserInfo = async () => {
      setLoadingTeams(true);
      try {
        // First, find if there's a user with matching email
        const userRes = await fetch(`${BACKEND_URL}/api/users/profiles?tenant_id=${tenantId}`, {
          credentials: 'include',
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          // API returns { status, data: { users: [...] } } or { status, data: [...] }
          const users =
            (Array.isArray(userData?.data?.users) && userData.data.users) ||
            (Array.isArray(userData?.data) && userData.data) ||
            (Array.isArray(userData) && userData) ||
            [];
          const linkedUser = users.find(
            (u) => u.email?.toLowerCase() === employee.email?.toLowerCase(),
          );

          if (linkedUser) {
            setLinkedUserInfo(linkedUser);

            // Fetch team memberships for this user
            const teamsRes = await fetch(
              `${BACKEND_URL}/api/v2/teams/user-memberships?user_id=${linkedUser.id || linkedUser.user_id}`,
              { credentials: 'include' },
            );

            if (teamsRes.ok) {
              const teamsData = await teamsRes.json();
              setTeamAssignments(teamsData.data || []);
            }
          }
        }
      } catch (err) {
        console.warn('[EmployeeForm] Failed to fetch linked user info:', err);
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchLinkedUserInfo();
  }, [employee?.email, tenantId]);

  const onChange = (key, value) => setFormData((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation - only required fields
    if (!formData.first_name?.trim()) {
      toast.error('First name is required');
      return;
    }
    if (!formData.last_name?.trim()) {
      toast.error('Last name is required');
      return;
    }

    if (!tenantId && !isEdit) {
      toast.error('Cannot save employee. Tenant information is missing.');
      return;
    }

    setSaving(true);

    try {
      // HR-only payload - no CRM access fields
      const entityPayload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email || null,
        phone: formData.phone || null,
        mobile: formData.mobile || null,
        department: formData.department,
        job_title: formData.job_title,
        reports_to: formData.reports_to || null,
        hire_date: formData.hire_date || null,
        employment_status: formData.employment_status,
        employment_type: formData.employment_type,
        hourly_rate: formData.hourly_rate ? Number(formData.hourly_rate) : null,
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
        ...(tenantId ? { tenant_id: tenantId } : {}),
      };

      let result;
      if (employee?.id) {
        result = await Employee.update(employee.id, entityPayload);
      } else {
        result = await Employee.create(entityPayload);
      }

      toast.success(isEdit ? 'Employee updated successfully' : 'Employee created successfully');

      // Call parent callback
      setTimeout(() => {
        if (onSubmit) {
          onSubmit(result);
        } else if (onSave) {
          onSave();
        }
      }, 500);
    } catch (error) {
      console.error('[EmployeeForm] Save error:', error);
      const errorMsg = error?.response?.data?.error || error?.message || 'Failed to save employee';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const getAccessLevelLabel = (level) => {
    switch (level) {
      case 'manage_team':
        return 'Manager';
      case 'view_team':
        return 'View Team';
      case 'view_own':
        return 'View Own';
      default:
        return level;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          <div>
            <Label className="text-slate-200">
              First name <span className="text-red-400">*</span>
            </Label>
            <Input
              required
              value={formData.first_name}
              onChange={(e) => onChange('first_name', e.target.value)}
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
              onChange={(e) => onChange('last_name', e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="Last name"
            />
          </div>
          <div>
            <Label className="text-slate-200">Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => onChange('email', e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="work@example.com"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used to link this employee to a CRM user account
            </p>
          </div>
          <div>
            <Label className="text-slate-200">Phone</Label>
            <Input
              value={formData.phone}
              onChange={(e) => onChange('phone', e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <Label className="text-slate-200">Mobile</Label>
            <Input
              value={formData.mobile}
              onChange={(e) => onChange('mobile', e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="(555) 987-6543"
            />
          </div>
          <div>
            <Label className="text-slate-200">Department</Label>
            <Select value={formData.department} onValueChange={(v) => onChange('department', v)}>
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
            <Label className="text-slate-200">Job Title</Label>
            <Input
              value={formData.job_title}
              onChange={(e) => onChange('job_title', e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              placeholder="Role / Title"
            />
          </div>
          <div>
            <Label className="text-slate-200">Reports To</Label>
            <Select
              value={formData.reports_to || '_none'}
              onValueChange={(v) => onChange('reports_to', v === '_none' ? null : v)}
              disabled={loadingEmployees}
            >
              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectValue placeholder={loadingEmployees ? 'Loading...' : 'Select manager'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-60">
                <SelectItem value="_none">
                  <span className="text-slate-400">No manager assigned</span>
                </SelectItem>
                {employeeOptions.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                    {emp.job_title && (
                      <span className="text-slate-400 ml-2">({emp.job_title})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">This employee&apos;s direct supervisor</p>
          </div>
          <div>
            <Label className="text-slate-200">Employment Status</Label>
            <Select
              value={formData.employment_status}
              onValueChange={(v) => onChange('employment_status', v)}
            >
              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-200">Employment Type</Label>
            <Select
              value={formData.employment_type}
              onValueChange={(v) => onChange('employment_type', v)}
            >
              <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-200">Hire Date</Label>
            <Input
              type="date"
              value={formData.hire_date}
              onChange={(e) => onChange('hire_date', e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
            />
          </div>
        </CardContent>
      </Card>

      {/* CRM Access Info (Read-Only) */}
      {isEdit && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-medium text-slate-100">CRM Access</h3>
              </div>
              {linkedUserInfo && (
                <a
                  href={`/settings?tab=users&edit=${linkedUserInfo.id || linkedUserInfo.user_id}`}
                  className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  Manage in User Settings
                </a>
              )}
            </div>

            {loadingTeams ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : linkedUserInfo ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-slate-300">
                    Linked to CRM user: <strong>{linkedUserInfo.email}</strong>
                  </span>
                </div>

                {teamAssignments.length > 0 ? (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Team Assignments:</p>
                    <div className="flex flex-wrap gap-2">
                      {teamAssignments.map((tm) => (
                        <Badge
                          key={tm.id}
                          variant="outline"
                          className="bg-slate-700/50 text-slate-200 border-slate-600"
                        >
                          {tm.teams?.name || 'Unknown Team'}
                          <span className="ml-1 text-slate-400">
                            ({getAccessLevelLabel(tm.access_level)})
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No team assignments</p>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                <p>No CRM user account linked to this employee.</p>
                <p className="mt-1">
                  To grant CRM access, create a user in{' '}
                  <a href="/settings?tab=users" className="text-blue-400 hover:underline">
                    User Management
                  </a>{' '}
                  with the same email address.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        <p className="text-xs text-slate-400">
          <span className="text-red-400">*</span> Required fields
        </p>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
            className="bg-slate-700 border-slate-600 text-slate-200"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? 'Saving...' : isEdit ? 'Update Employee' : 'Create Employee'}
          </Button>
        </div>
      </div>
    </form>
  );
}
