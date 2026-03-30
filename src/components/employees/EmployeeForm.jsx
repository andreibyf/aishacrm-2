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
import { Users, ExternalLink, Link2, CalendarCheck, Search } from 'lucide-react';

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
    // Per-employee booking calendar fields (stored in employees.metadata)
    calcom_cal_link: employee?.metadata?.calcom_cal_link || '',
    calcom_user_id: employee?.metadata?.calcom_user_id || '',
    calcom_event_type_id: employee?.metadata?.calcom_event_type_id || '',
  }));

  const [saving, setSaving] = useState(false);

  // Cal.com lookup state
  const [calcomLookup, setCalcomLookup] = useState({ loading: false, error: null, eventTypes: [] });

  const handleCalcomLookup = async () => {
    const username = formData.calcom_cal_link?.split('/')[0]?.trim();
    if (!username) {
      setCalcomLookup({
        loading: false,
        error: 'Enter a booking link first (e.g. username/30min)',
        eventTypes: [],
      });
      return;
    }
    setCalcomLookup({ loading: true, error: null, eventTypes: [] });
    try {
      const params = new URLSearchParams({ username, tenant_id: tenantId });
      const res = await fetch(`${BACKEND_URL}/api/calcom-sync/lookup-user?${params}`, {
        credentials: 'include',
      });
      const payload = await res.json();
      if (!res.ok || payload.status !== 'success') {
        setCalcomLookup({
          loading: false,
          error: payload.message || 'Lookup failed',
          eventTypes: [],
        });
        return;
      }
      const { user_id, event_types } = payload.data;
      onChange('calcom_user_id', String(user_id));
      // Auto-select first event type if none set
      if (!formData.calcom_event_type_id && event_types.length > 0) {
        onChange('calcom_event_type_id', String(event_types[0].id));
      }
      setCalcomLookup({ loading: false, error: null, eventTypes: event_types });
      toast.success(`Found scheduler user ID ${user_id} with ${event_types.length} event type(s)`);
    } catch (err) {
      setCalcomLookup({
        loading: false,
        error: 'Could not reach scheduler database',
        eventTypes: [],
      });
    }
  };

  // Auto-load event types when editing an employee that already has a cal link configured
  useEffect(() => {
    if (!employee?.metadata?.calcom_cal_link || !tenantId) return;
    const username = employee.metadata.calcom_cal_link.split('/')[0].trim();
    if (!username) return;
    const params = new URLSearchParams({ username, tenant_id: tenantId });
    fetch(`${BACKEND_URL}/api/calcom-sync/lookup-user?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.status === 'success') {
          setCalcomLookup((prev) => ({ ...prev, eventTypes: payload.data.event_types }));
        }
      })
      .catch(() => {}); // non-fatal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [tenantId, employee?.id, employee?.tenant_id]);

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
        // Merge per-employee booking fields into metadata
        metadata: {
          ...(employee?.metadata || {}),
          ...(formData.calcom_cal_link ? { calcom_cal_link: formData.calcom_cal_link } : {}),
          ...(formData.calcom_user_id ? { calcom_user_id: Number(formData.calcom_user_id) } : {}),
          ...(formData.calcom_event_type_id
            ? { calcom_event_type_id: Number(formData.calcom_event_type_id) }
            : {}),
        },
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

      {/* Booking Calendar */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-medium text-slate-100">Booking Calendar</h3>
            </div>
            <a
              href={`${import.meta.env.VITE_CALCOM_URL || 'http://localhost:3002'}/auth/signup`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              Create booking account
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
          <p className="text-xs text-slate-400">
            Set per-employee booking details. When an activity is assigned to this employee their
            calendar is used for scheduling. Leave blank to use the tenant default.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="text-slate-200">Personal Booking Link</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.calcom_cal_link}
                  onChange={(e) => onChange('calcom_cal_link', e.target.value)}
                  className="bg-slate-900 border-slate-700 text-slate-100 font-mono flex-1"
                  placeholder="username/30min"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCalcomLookup}
                  disabled={calcomLookup.loading || !formData.calcom_cal_link}
                  className="bg-slate-700 border-slate-600 text-slate-200 shrink-0"
                  title="Look up scheduler user ID and event types"
                >
                  {calcomLookup.loading ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-1" />
                      Lookup
                    </>
                  )}
                </Button>
              </div>
              {calcomLookup.error && (
                <p className="text-xs text-red-400 mt-1">{calcomLookup.error}</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                The slug from the employee&apos;s booking URL (e.g. <code>username/30min</code>).
                Customers will see this employee&apos;s availability when booking.
              </p>
              {formData.calcom_cal_link && (
                <a
                  href={`${import.meta.env.VITE_CALCOM_URL || 'http://localhost:3002'}/${formData.calcom_cal_link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-1 font-mono"
                >
                  {`${import.meta.env.VITE_CALCOM_URL || 'http://localhost:3002'}/${formData.calcom_cal_link}`}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
            <div>
              <Label className="text-slate-200">Scheduler User ID</Label>
              <Input
                type="number"
                value={formData.calcom_user_id}
                onChange={(e) => onChange('calcom_user_id', e.target.value)}
                className="bg-slate-900 border-slate-700 text-slate-100 font-mono"
                placeholder="Auto-filled by Lookup"
              />
              <p className="text-xs text-slate-500 mt-1">
                Numeric user ID in the scheduling system (used for blocker bookings). Auto-filled
                when you click Lookup.
              </p>
            </div>
            <div>
              <Label className="text-slate-200">Event Type ID</Label>
              {calcomLookup.eventTypes.length > 0 ? (
                <Select
                  value={String(formData.calcom_event_type_id)}
                  onValueChange={(v) => onChange('calcom_event_type_id', v)}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                    {calcomLookup.eventTypes.map((et) => (
                      <SelectItem key={et.id} value={String(et.id)}>
                        {et.title} ({et.length} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  value={formData.calcom_event_type_id}
                  onChange={(e) => onChange('calcom_event_type_id', e.target.value)}
                  className="bg-slate-900 border-slate-700 text-slate-100 font-mono"
                  placeholder="Auto-filled by Lookup"
                />
              )}
              <p className="text-xs text-slate-500 mt-1">
                Event type used for blocking the employee&apos;s calendar when a CRM activity is
                created. Auto-filled when you click Lookup.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
