import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Briefcase,
  Check,
  Clock,
  Copy,
  Edit,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import PhoneDisplay from '../shared/PhoneDisplay';
// EmployeePermissionsDialog removed - permissions now managed via User Management wizard
import { User as UserEntity } from '@/api/entities';
import { syncEmployeeUserPermissions } from '@/api/functions';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

export default function EmployeeDetailPanel({
  employee,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  user,
  onManagePermissions,
}) {
  // Ensure hooks are always called (moved above any early return)
  const [__showAccessDialog, __setShowAccessDialog] = React.useState(false);
  const [__currentUser, __setCurrentUser] = React.useState(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [teamMemberships, setTeamMemberships] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [reportsToEmployee, setReportsToEmployee] = useState(null);
  const [loadingReportsTo, setLoadingReportsTo] = useState(false);
  
  // User link state
  const [linkedUserId, setLinkedUserId] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null); // null | { valid: true } | { valid: false, errors: [...] }

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await UserEntity.me();
        if (mounted) __setCurrentUser(me);
      } catch (error) {
        console.error('Failed to fetch current user for EmployeeDetailPanel:', error);
        if (mounted) __setCurrentUser(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize linked user ID from employee metadata
  React.useEffect(() => {
    if (open && employee?.metadata?.linked_user_id) {
      setLinkedUserId(employee.metadata.linked_user_id);
      // Check if needs revalidation
      if (employee.metadata.link_needs_revalidation) {
        setValidationResult({ valid: false, errors: ['Link needs revalidation - a key field may have changed'] });
      } else if (employee.metadata.link_validated_at) {
        setValidationResult({ valid: true });
      }
    } else {
      setLinkedUserId('');
      setValidationResult(null);
    }
  }, [open, employee?.id, employee?.metadata?.linked_user_id]);

  // Fetch team memberships for this employee
  React.useEffect(() => {
    if (!open || !employee?.id) {
      setTeamMemberships([]);
      return;
    }

    let mounted = true;
    const fetchTeams = async () => {
      setLoadingTeams(true);
      try {
        // Try to fetch via user_id first (if employee has linked CRM user)
        // Otherwise fall back to employee_id
        const res = await fetch(
          `${BACKEND_URL}/api/v2/teams/employee-memberships`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employee.id, tenant_id: employee.tenant_id }),
          },
        );
        if (res.ok) {
          const json = await res.json();
          if (mounted) setTeamMemberships(json.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch team memberships:', error);
      } finally {
        if (mounted) setLoadingTeams(false);
      }
    };
    fetchTeams();

    return () => {
      mounted = false;
    };
  }, [open, employee?.id]);

  // Fetch the manager/reports_to employee details
  React.useEffect(() => {
    if (!open || !employee?.reports_to) {
      setReportsToEmployee(null);
      return;
    }

    let mounted = true;
    const fetchManager = async () => {
      setLoadingReportsTo(true);
      try {
        const tenantId = employee?.tenant_id;
        const url = tenantId
          ? `${BACKEND_URL}/api/employees/${employee.reports_to}?tenant_id=${tenantId}`
          : `${BACKEND_URL}/api/employees/${employee.reports_to}`;
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (mounted) setReportsToEmployee(data.data || data);
        }
      } catch (error) {
        console.error('Failed to fetch reports_to employee:', error);
      } finally {
        if (mounted) setLoadingReportsTo(false);
      }
    };
    fetchManager();

    return () => {
      mounted = false;
    };
  }, [open, employee?.reports_to]);

  // Admins, superadmins, and managers can manage employee access
  const __canManageEmployeeAccess = React.useMemo(() => {
    if (!__currentUser) return false;
    if (__currentUser.role === 'admin' || __currentUser.role === 'superadmin') {
      return true;
    }
    return __currentUser.employee_role === 'manager';
  }, [__currentUser]);

  // Validate user link
  const handleValidateUserLink = async () => {
    if (!linkedUserId.trim()) {
      toast.error('Please enter a User ID');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/employees/${employee.id}/validate-user-link`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: linkedUserId.trim() }),
        },
      );

      const data = await res.json();

      if (res.ok && data.valid) {
        setValidationResult({ valid: true });
        toast.success('User link validated and established');
        // Optionally refresh the employee data to show updated metadata
      } else {
        setValidationResult({ valid: false, errors: data.errors || [data.message || 'Validation failed'] });
        toast.error(data.errors?.[0] || data.message || 'Validation failed');
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResult({ valid: false, errors: ['Failed to validate - network error'] });
      toast.error('Failed to validate user link');
    } finally {
      setIsValidating(false);
    }
  };

  // New function as per outline
  const handleSyncPermissions = async () => {
    if (!employee?.user_email) {
      toast.error('This employee is not linked to a CRM user');
      return;
    }

    setIsSyncing(true);
    try {
      const response = await syncEmployeeUserPermissions({
        employee_id: employee.id,
      });
      if (response.status === 200 && response.data?.success) {
        toast.success('Permissions synced successfully');
        // Trigger refresh to show updated data, as employee prop might not reflect changes immediately
        window.location.reload();
      } else {
        throw new Error(response.data?.error || 'Failed to sync permissions');
      }
    } catch (error) {
      let msg = 'Failed to sync permissions';
      try {
        if (error?.message) msg = error.message;
      } catch (e) {
        void e;
      }
      console.error('Sync error:', msg);
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  const statusColors = {
    active: 'bg-green-900/30 text-green-400 border-green-700',
    inactive: 'bg-slate-700 text-slate-400 border-slate-600',
    terminated: 'bg-red-900/30 text-red-400 border-red-700',
    on_leave: 'bg-yellow-900/30 text-yellow-400 border-yellow-700',
  };

  const employmentTypeColors = {
    full_time: 'bg-blue-900/30 text-blue-400 border-blue-700',
    part_time: 'bg-purple-900/30 text-purple-400 border-purple-700',
    contractor: 'bg-orange-900/30 text-orange-400 border-orange-700',
    seasonal: 'bg-teal-900/30 text-teal-400 border-teal-700',
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDepartment = (dept) => {
    if (!dept) return 'N/A';
    return dept.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const canManage = React.useMemo(() => {
    if (!user) return false;
    if (user.role === 'superadmin' || user.role === 'admin') {
      return !!employee?.user_email;
    }
    return (user.tier === 'Tier3' || user.tier === 'Tier4') && !!employee?.user_email;
  }, [user, employee]);

  // After hooks are set up, we can safely early-return
  if (!employee) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-1/2 !max-w-none overflow-y-auto bg-slate-900 border-l border-slate-700 text-slate-100">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-slate-300" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold text-slate-100">
                  {employee.first_name} {employee.last_name}
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  {employee.job_title} • {formatDepartment(employee.department)}
                </SheetDescription>
              </div>
            </div>
            <div className="flex gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManagePermissions && onManagePermissions(employee)}
                  className="bg-slate-800 border-slate-600 text-indigo-300 hover:bg-slate-700"
                  title="Manage Permissions"
                >
                  <Shield className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(employee)}
                className="bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(employee.id)}
                className="bg-slate-800 border-slate-600 text-red-400 hover:bg-slate-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge className={statusColors[employee.employment_status] || statusColors.active}>
              {employee.employment_status?.replace(/_/g, ' ')}
            </Badge>
            <Badge
              className={
                employmentTypeColors[employee.employment_type] || employmentTypeColors.full_time
              }
            >
              {employee.employment_type?.replace(/_/g, ' ')}
            </Badge>
          </div>
        </SheetHeader>

        {/* Manage Access button - links to User Management for CRM permissions */}
        {__canManageEmployeeAccess && (
          <div className="mt-3 mb-6 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-white"
              onClick={() => {
                // Navigate to User Management with this user's email
                window.location.href = `/settings?tab=users&search=${encodeURIComponent(employee?.email || '')}`;
              }}
            >
              <Shield className="w-4 h-4 mr-2" />
              Manage Access
            </Button>

            {/* Sync Permissions button - show if employee has CRM access */}
            {employee?.has_crm_access && employee?.user_email && (
              <Button
                variant="outline"
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-white"
                onClick={handleSyncPermissions}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync Permissions
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        <Separator className="my-6 bg-slate-700" />

        <div className="space-y-6">
          {/* Contact Information */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Email:</span>
                <span className="col-span-2 text-sm text-slate-200">{employee.email || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Phone:</span>
                <div className="col-span-2">
                  {employee.phone ? (
                    <PhoneDisplay
                      user={user}
                      phone={employee.phone}
                      contactName={`${employee.first_name} ${employee.last_name}`}
                    />
                  ) : (
                    <span className="text-sm text-slate-500 italic">No phone</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Mobile:</span>
                <div className="col-span-2">
                  {employee.mobile ? (
                    <PhoneDisplay
                      user={user}
                      phone={employee.mobile}
                      contactName={`${employee.first_name} ${employee.last_name}`}
                    />
                  ) : (
                    <span className="text-sm text-slate-500 italic">No mobile</span>
                  )}
                </div>
              </div>
              {/* WhatsApp AiSHA access */}
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">WhatsApp:</span>
                <div className="col-span-2">
                  {employee.whatsapp_enabled ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-900/30 text-green-300 border-green-700 text-xs">
                        ✓ AiSHA Enabled
                      </Badge>
                      {employee.whatsapp_number && (
                        <PhoneDisplay
                          user={user}
                          phone={employee.whatsapp_number}
                          contactName={`${employee.first_name} ${employee.last_name}`}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500 italic">Not enabled</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Team Assignment */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Team Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTeams ? (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading teams...</span>
                </div>
              ) : teamMemberships.length > 0 ? (
                <div className="space-y-2">
                  {teamMemberships.map((tm) => (
                    <div
                      key={tm.team_id}
                      className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-200">
                          {tm.team_name || 'Unknown Team'}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          tm.access_level === 'manage_team'
                            ? 'bg-green-900/30 text-green-300 border-green-700'
                            : tm.access_level === 'view_team'
                              ? 'bg-blue-900/30 text-blue-300 border-blue-700'
                              : 'bg-slate-700 text-slate-300 border-slate-600'
                        }
                      >
                        {tm.access_level === 'manage_team'
                          ? 'Manager'
                          : tm.access_level === 'view_team'
                            ? 'View Team'
                            : 'View Own'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500 italic">
                  Not assigned to any team
                  {__canManageEmployeeAccess && (
                    <span className="block mt-1 text-xs">
                      Assign teams via{' '}
                      <button
                        className="text-blue-400 hover:underline"
                        onClick={() => {
                          window.location.href = `/settings?tab=users&search=${encodeURIComponent(employee?.email || '')}`;
                        }}
                      >
                        User Management
                      </button>
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employment Details */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-green-400" />
                Employment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {employee.employee_number && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Employee #:</span>
                  <span className="col-span-2 text-sm text-slate-200">
                    {employee.employee_number}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Reports To:</span>
                <div className="col-span-2">
                  {loadingReportsTo ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-sm">Loading...</span>
                    </div>
                  ) : reportsToEmployee ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center">
                        <User className="w-3 h-3 text-slate-300" />
                      </div>
                      <span className="text-sm text-slate-200">
                        {reportsToEmployee.first_name} {reportsToEmployee.last_name}
                      </span>
                      {reportsToEmployee.job_title && (
                        <span className="text-xs text-slate-500">
                          ({reportsToEmployee.job_title})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500 italic">Not assigned</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Hire Date:</span>
                <span className="col-span-2 text-sm text-slate-200">
                  {formatDate(employee.hire_date)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Hourly Rate:</span>
                <span className="col-span-2 text-sm text-slate-200">
                  {employee.hourly_rate
                    ? `$${Number(employee.hourly_rate).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}/hr`
                    : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* CRM User Link */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-cyan-400" />
                CRM User Link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Employee ID (for reference) */}
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Employee ID:</span>
                <div className="col-span-2 flex items-center gap-2">
                  <code className="text-xs text-slate-300 bg-slate-700/50 px-2 py-0.5 rounded font-mono">
                    {employee.id}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(employee.id);
                      toast.success('Employee ID copied');
                    }}
                    className="text-slate-400 hover:text-slate-200"
                    title="Copy Employee ID"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* User ID Input */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Linked User ID:</label>
                <div className="flex gap-2">
                  <Input
                    value={linkedUserId}
                    onChange={(e) => {
                      setLinkedUserId(e.target.value);
                      // Clear validation when user types
                      if (validationResult) setValidationResult(null);
                    }}
                    placeholder="Paste User ID from User Management"
                    className="bg-slate-900 border-slate-600 text-slate-200 font-mono text-xs flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleValidateUserLink}
                    disabled={isValidating || !linkedUserId.trim()}
                    className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                  >
                    {isValidating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Validate
                      </>
                    )}
                  </Button>
                </div>

                {/* Validation Status */}
                {validationResult && (
                  <div
                    className={`flex items-start gap-2 p-2 rounded text-sm ${
                      validationResult.valid
                        ? 'bg-green-900/30 text-green-300 border border-green-700'
                        : 'bg-red-900/30 text-red-300 border border-red-700'
                    }`}
                  >
                    {validationResult.valid ? (
                      <>
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Link validated successfully. Employee ID has been written to User record.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                          {validationResult.errors?.map((err, i) => (
                            <div key={i}>{err}</div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Help text */}
                <p className="text-xs text-slate-500">
                  Copy the User ID from User Management and paste here. Click Validate to link the records.
                  {validationResult?.valid && (
                    <span className="block mt-1">
                      <button
                        className="text-blue-400 hover:underline inline-flex items-center gap-1"
                        onClick={() => {
                          window.location.href = `/settings?tab=users&search=${encodeURIComponent(employee?.email || '')}`;
                        }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        View in User Management
                      </button>
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* CRM Access & Role Level */}
          {employee.has_crm_access && employee.user_email && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  CRM Access & Permissions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">CRM User:</span>
                  <span className="col-span-2 text-sm text-slate-200">{employee.user_email}</span>
                </div>
                {employee.metadata?.user_id && (
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-sm text-slate-400">User ID:</span>
                    <div className="col-span-2 flex items-center gap-2">
                      <code className="text-xs text-slate-300 bg-slate-700/50 px-2 py-0.5 rounded font-mono">
                        {employee.metadata.user_id}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(employee.metadata.user_id);
                          toast.success('User ID copied');
                        }}
                        className="text-slate-400 hover:text-slate-200"
                        title="Copy User ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Role Level:</span>
                  <span className="col-span-2">
                    {employee.crm_user_employee_role === 'leadership' ? (
                      <Badge className="bg-indigo-900/30 text-indigo-300 border-indigo-700">
                        Leadership
                      </Badge>
                    ) : employee.crm_user_employee_role === 'manager' ? (
                      <Badge className="bg-purple-900/30 text-purple-300 border-purple-700">
                        Manager
                      </Badge>
                    ) : employee.crm_user_employee_role === 'employee' ? (
                      <Badge className="bg-slate-700 text-slate-300 border-slate-600">
                        User
                      </Badge>
                    ) : (
                      <span className="text-sm text-slate-500 italic">Not Set</span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Access Level:</span>
                  <span className="col-span-2">
                    {employee.crm_user_access_level === 'read_write' ? (
                      <Badge className="bg-green-900/30 text-green-300 border-green-700">
                        Read/Write
                      </Badge>
                    ) : employee.crm_user_access_level === 'read' ? (
                      <Badge className="bg-yellow-900/30 text-yellow-300 border-yellow-700">
                        Read Only
                      </Badge>
                    ) : (
                      <span className="text-sm text-slate-500 italic">Not Set</span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Description:</span>
                  <span className="col-span-2 text-xs text-slate-400">
                    {employee.crm_user_employee_role === 'leadership'
                      ? 'Can view and manage all tenant records'
                      : employee.crm_user_employee_role === 'manager'
                        ? 'Can view and manage team records'
                        : 'Can only view and manage their own records'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Address Information */}
          {(employee.address_1 || employee.city || employee.state) && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-purple-400" />
                  Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-slate-200">
                  {employee.address_1 && <div>{employee.address_1}</div>}
                  {employee.address_2 && <div>{employee.address_2}</div>}
                  {(employee.city || employee.state || employee.zip) && (
                    <div>
                      {employee.city && employee.city}
                      {employee.city && employee.state && ', '}
                      {employee.state && employee.state}
                      {employee.zip && ` ${employee.zip}`}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Emergency Contact */}
          {(employee.emergency_contact_name || employee.emergency_contact_phone) && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-400" />
                  Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Name:</span>
                  <span className="col-span-2 text-sm text-slate-200">
                    {employee.emergency_contact_name || 'N/A'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Phone:</span>
                  <div className="col-span-2">
                    {employee.emergency_contact_phone ? (
                      <PhoneDisplay
                        user={user}
                        phone={employee.emergency_contact_phone}
                        contactName={employee.emergency_contact_name}
                      />
                    ) : (
                      <span className="text-sm text-slate-500 italic">No phone</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Skills & Notes */}
          {(employee.skills?.length > 0 || employee.notes) && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-400" />
                  Additional Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {employee.skills?.length > 0 && (
                  <div>
                    <span className="text-sm text-slate-400 block mb-2">Skills:</span>
                    <div className="flex gap-2 flex-wrap">
                      {employee.skills.map((skill, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-slate-700 border-slate-600 text-slate-300 text-xs"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {employee.notes && (
                  <div>
                    <span className="text-sm text-slate-400 block mb-2">Notes:</span>
                    <p className="text-sm text-slate-200 bg-slate-700/50 p-3 rounded border border-slate-600">
                      {employee.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Record Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Created:</span>
                <span className="col-span-2 text-sm text-slate-200">
                  {formatDate(employee.created_date)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Updated:</span>
                <span className="col-span-2 text-sm text-slate-200">
                  {formatDate(employee.updated_date)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Created By:</span>
                <span className="col-span-2 text-sm text-slate-200">
                  {employee.created_by || 'System'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* EmployeePermissionsDialog removed - permissions now managed via User Management wizard */}
      </SheetContent>
    </Sheet>
  );
}
