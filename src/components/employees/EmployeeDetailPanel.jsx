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
  Briefcase,
  Clock,
  Edit,
  Link2,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
  Shield,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import PhoneDisplay from '../shared/PhoneDisplay';
import EmployeePermissionsDialog from './EmployeePermissionsDialog';
import { User as UserEntity } from '@/api/entities';
import { linkEmployeeToCRMUser } from '@/api/functions';
import { syncEmployeeUserPermissions } from '@/api/functions';
import { toast } from 'sonner';

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
  const [linking, setLinking] = React.useState(false);
  const [isSyncing, setIsSyncing] = useState(false); // New state as per outline

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

  const __canManageEmployeeAccess = React.useMemo(() => {
    if (!__currentUser) return false;
    if (__currentUser.role === 'admin' || __currentUser.role === 'superadmin') {
      return true;
    }
    return __currentUser.employee_role === 'manager';
  }, [__currentUser]);

  const handleLinkCRMUser = async () => {
    if (!employee?.email) {
      toast.error('Employee must have an email address to link to a CRM user');
      return;
    }

    setLinking(true);
    try {
      const response = await linkEmployeeToCRMUser({
        employee_id: employee.id,
        employee_email: employee.email,
      });

      if (response.status === 200 && response.data?.success) {
        toast.success(
          response.data.message || `Successfully linked to CRM user: ${employee.email}`,
        );

        // Refresh the page to show updated data
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const errorMsg = response.data?.error || 'Failed to link to CRM user';
        toast.error(errorMsg);
      }
    } catch (error) {
      let msg = 'Failed to link to CRM user';
      try {
        if (error?.message) msg = error.message;
      } catch (e) {
        void e;
      }
      console.error('Link error:', msg);
      toast.error(msg);
    } finally {
      setLinking(false);
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
    active: 'bg-green-100 text-green-700 border-green-200',
    inactive: 'bg-gray-100 text-gray-700 border-gray-200',
    terminated: 'bg-red-100 text-red-700 border-red-200',
    on_leave: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  };

  const employmentTypeColors = {
    full_time: 'bg-blue-100 text-blue-700 border-blue-200',
    part_time: 'bg-purple-100 text-purple-700 border-purple-200',
    contractor: 'bg-orange-100 text-orange-700 border-orange-200',
    seasonal: 'bg-teal-100 text-teal-700 border-teal-200',
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
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-slate-900 border-slate-700 text-slate-100">
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

        {/* Link CRM User button - show if has email but no user_email */}
        {employee.email && !employee.user_email && __canManageEmployeeAccess && (
          <div className="mt-3 mb-6">
            <Button
              variant="outline"
              className="w-full bg-blue-900/30 border-blue-700 text-blue-300 hover:bg-blue-900/50 hover:text-blue-200"
              onClick={handleLinkCRMUser}
              disabled={linking}
            >
              {linking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Link to CRM User
                </>
              )}
            </Button>
            <p className="text-xs text-slate-400 mt-2">
              This will link this employee to an existing CRM user account with email:{' '}
              {employee.email}
            </p>
          </div>
        )}

        {/* Manage Access and Sync Permissions buttons (visible to Admin/Superadmin or Tier3/4) */}
        {__canManageEmployeeAccess && (
          <div className="mt-3 mb-6 flex flex-wrap gap-2">
            {/* Added flex gap for buttons */}
            <Button
              variant="outline"
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-white"
              onClick={() => __setShowAccessDialog(true)}
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

          {/* Employment Details */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-green-400" />
                Employment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-slate-400">Employee ID:</span>
                <span className="col-span-2 text-sm text-slate-200">
                  {employee.employee_number || 'N/A'}
                </span>
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
                  {employee.hourly_rate ? `$${employee.hourly_rate}/hr` : 'N/A'}
                </span>
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
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-sm text-slate-400">Role Level:</span>
                  <span className="col-span-2">
                    {employee.crm_user_employee_role === 'manager' ? (
                      <Badge className="bg-purple-900/30 text-purple-300 border-purple-700">
                        Manager
                      </Badge>
                    ) : employee.crm_user_employee_role === 'employee' ? (
                      <Badge className="bg-blue-900/30 text-blue-300 border-blue-700">
                        Employee
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
                    {employee.crm_user_employee_role === 'manager'
                      ? 'Can view and manage all team records'
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

        {/* Access dialog mounted with current employee record */}
        <EmployeePermissionsDialog
          open={__showAccessDialog}
          onOpenChange={__setShowAccessDialog}
          employee={employee}
          editorUser={__currentUser}
          onSuccess={() => {
            __setShowAccessDialog(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
